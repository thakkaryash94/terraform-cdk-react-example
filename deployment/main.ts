import { Construct } from 'constructs';
import * as path from 'path';
import { App, TerraformStack, TerraformOutput } from 'cdktf';
import * as glob from 'glob';
import * as mime from 'mime-types';
import { AwsProvider, S3Bucket, S3BucketObject, CloudfrontDistribution, CloudfrontOriginAccessIdentity } from './.gen/providers/aws';

class MyStack extends TerraformStack {
  constructor(scope: Construct, id: string) {
    super(scope, id);

    // assign AWS region
    new AwsProvider(this, 'aws', {
      region: 'us-west-1'
    });

    // Define AWS S3 bucket name
    const BUCKET_NAME = 'thakkaryash94-cdk-dev';

    // Create bucket with public access
    const bucket = new S3Bucket(this, 'aws_s3_bucket', {
      acl: 'public-read',
      website: [{
        indexDocument: 'index.html',
        errorDocument: 'index.html',
      }],
      tags: {
        'Terraform': "true",
        "Environment": "dev"
      },
      bucket: BUCKET_NAME,
      policy: `{
        "Version": "2012-10-17",
        "Statement": [
          {
            "Sid": "PublicReadGetObject",
            "Effect": "Allow",
            "Principal": "*",
            "Action": [
              "s3:GetObject"
            ],
            "Resource": [
              "arn:aws:s3:::${BUCKET_NAME}/*"
            ]
          }
        ]
      }`,
    });

    // Get all the files from build folder, skip directories
    const files = glob.sync('../web/build/**/*', { absolute: false, nodir: true });

    // Create bucket object for each file
    for (const file of files) {
      new S3BucketObject(this, `aws_s3_bucket_object_${path.basename(file)}`, {
        dependsOn: [bucket],
        key: file.replace(`../web/build/`, ''),       // Using relative path for folder structure on S3
        bucket: BUCKET_NAME,
        source: path.resolve(file),          // Using absolute path to upload
        etag: `${Date.now()}`,
        contentType: mime.contentType(path.extname(file)) || undefined       // Set the content-type for each object
      });
    }

    const originId = `S3-${BUCKET_NAME}`;

    /*
     * Create am Origin Access Identity
     * Doc link: https://aws.amazon.com/premiumsupport/knowledge-center/cloudfront-access-to-amazon-s3/
     * Tutorial link: https://aws.amazon.com/premiumsupport/knowledge-center/cloudfront-access-to-amazon-s3/
     */
    const cloudfrontOriginAccessIdentity = new CloudfrontOriginAccessIdentity(this, 'aws_cloudfront_origin_access_identity', {
      comment: 's3-cloudfront-cdk-example'
    })

    const cloudFrontDistribution = new CloudfrontDistribution(this, `aws_cloudfront_${BUCKET_NAME}`, {
      enabled: true,
      dependsOn: [bucket],
      defaultRootObject: 'index.html',
      customErrorResponse: [{
        errorCode: 404,
        responseCode: 200,
        responsePagePath: '/index.html'
      }],
      origin: [{
        originId: originId,
        domainName: bucket.bucketDomainName,
        s3OriginConfig: [{
          originAccessIdentity: cloudfrontOriginAccessIdentity.cloudfrontAccessIdentityPath
        }]
      }],
      defaultCacheBehavior: [{
        allowedMethods: ['GET', 'HEAD'],
        cachedMethods: ['GET', 'HEAD'],
        forwardedValues: [{
          cookies: [{ forward: 'none' }],
          queryString: false
        }],
        targetOriginId: originId,
        viewerProtocolPolicy: 'allow-all'
      }],
      restrictions: [{
        geoRestriction: [{
          restrictionType: 'none'
        }]
      }],
      viewerCertificate: [{
        cloudfrontDefaultCertificate: true
      }],
    });

    /*
     * Previously, our bucket was public, it means anyone can access bucket objects using bucket website URL.
     * Now, we have configured CloudFront to serve our website, so it's time to block that access.
     * With this, our website will be only accessible by CloudFront URL only.
     * No-one will be able to access bucket objects using S3 website URL.
    */
    bucket.acl = 'private'
    bucket.website = []
    bucket.policy = `{
      "Version": "2012-10-17",
      "Statement": [
        {
          "Sid": "PublicReadGetObject",
          "Effect": "Allow",
          "Principal": {
            "AWS": "arn:aws:iam::cloudfront:user/CloudFront Origin Access Identity ${cloudfrontOriginAccessIdentity.id}"
          },
          "Action": [
            "s3:GetObject"
          ],
          "Resource": [
            "arn:aws:s3:::${BUCKET_NAME}/*"
          ]
        }
      ]
    }`

    // Output the bucket url to access the website
    new TerraformOutput(this, 'website_endpoint', {
      description: 'S3 Bucket Public URL',
      value: `http://${bucket.websiteEndpoint}`
    });

    // Output the cloudfront url to access the website
    new TerraformOutput(this, 'cloudfront_website_endpoint', {
      description: 'CloudFront URL',
      value: `https://${cloudFrontDistribution.domainName}`
    });

  }
}

const app = new App();
new MyStack(app, 'typescript-aws');
app.synth();
