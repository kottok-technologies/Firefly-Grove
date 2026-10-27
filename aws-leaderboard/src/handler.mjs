import {DynamoStore} from './dynamo-store.mjs';
import {createHandler} from './service.mjs';
export const handler=createHandler(new DynamoStore(process.env.TABLE_NAME));
