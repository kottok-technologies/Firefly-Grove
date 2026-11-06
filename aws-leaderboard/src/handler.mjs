import {DynamoStore} from './dynamo-store.mjs';
import {createHandler} from './service.mjs';
import {createCoreClient,environmentSecret} from './kid-core.mjs';
import {consentService} from './kid-consent.mjs';
import {attachConsentStore} from './consent-store.mjs';
const store=attachConsentStore(new DynamoStore(process.env.TABLE_NAME));
export const handler=createHandler(store,{consent:consentService(store,createCoreClient({secret:environmentSecret()})),enforceConsent:process.env.KID_ENFORCE==='true'});
