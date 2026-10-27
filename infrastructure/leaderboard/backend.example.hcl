bucket       = "REPLACE_WITH_BOOTSTRAP_STATE_BUCKET"
key          = "leaderboard/production.tfstate"
region       = "us-east-1"
encrypt      = true
use_lockfile = true
kms_key_id   = "REPLACE_WITH_BOOTSTRAP_KMS_KEY_ARN"
