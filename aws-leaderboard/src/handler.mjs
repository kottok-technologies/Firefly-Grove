import {DynamoStore} from './dynamo-store.mjs';
import {createHandler} from './service.mjs';
import {createCoreClient} from './kid-core.mjs';
import {consentService} from './kid-consent.mjs';
import {attachConsentStore} from './consent-store.mjs';
const store=attachConsentStore(new DynamoStore(process.env.TABLE_NAME));
export const handler=createHandler(store,{consent:consentService(store,{test:createCoreClient(),live:createCoreClient({environment:'live'})}),enforceConsent:process.env.KID_ENFORCE==='true'});
