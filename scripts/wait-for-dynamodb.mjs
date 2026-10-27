import {createRequire} from 'node:module';
const require=createRequire(new URL('../aws-leaderboard/package.json',import.meta.url));
const {DynamoDBClient,ListTablesCommand}=require('@aws-sdk/client-dynamodb');
const endpoint=process.env.DYNAMODB_ENDPOINT;
if(!endpoint||!['localhost','127.0.0.1'].includes(new URL(endpoint).hostname))throw Error('A local DYNAMODB_ENDPOINT is required.');
const client=new DynamoDBClient({endpoint,region:'us-east-1',credentials:{accessKeyId:'LOCALTESTONLY',secretAccessKey:'LOCALTESTONLY'},maxAttempts:1});
try{
  for(let attempt=0;attempt<30;attempt++){
    try{await client.send(new ListTablesCommand({}));console.log('Local DynamoDB is ready.');break;}
    catch(error){if(attempt===29)throw error;await new Promise(resolve=>setTimeout(resolve,1000));}
  }
}finally{client.destroy();}
