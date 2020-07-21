import { Construct } from 'constructs';
import * as path from 'path';
import { App, TerraformStack, TerraformOutput } from 'cdktf';
import * as glob from 'glob';
import * as mime from 'mime-types';
import { AwsProvider, S3Bucket, S3BucketObject } from './.gen/providers/aws';

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
    var files = glob.sync('../web/build/**/*', { absolute: false, nodir: true });

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

    // Output the bucket url to access the website
    new TerraformOutput(this, 'website_endpoint', {
      value: `http://${bucket.websiteEndpoint}`
    });

  }
}

const app = new App();
new MyStack(app, 'typescript-aws');
app.synth();
