output "api_url" {
  value       = aws_apigatewayv2_api.leaderboard.api_endpoint
  description = "Public HTTPS origin for the Android leaderboard configuration."
}
output "table_name" { value = aws_dynamodb_table.scores.name }
output "function_name" { value = aws_lambda_function.api.function_name }
output "live_version" { value = aws_lambda_alias.live.function_version }
