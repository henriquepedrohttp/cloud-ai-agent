variable "aws_region" {
  description = "Região da AWS"
  type        = string
  default    = "us-east-1"
}

variable "project_name" {
  description = "Nome do projeto"
  type        = string
  default    = "ai-agent"
}

variable "instance_type" {
  description = "Tipo de instância"
  type        = string
  default    = "t3.micro"
}

variable "opencode_api_key" {
  description = "API Key do OpenCode (não será exposta nos logs)"
  type        = string
  sensitive   = true
}

variable "github_repo" {
  description = "URL do repositório GitHub"
  type        = string
  default    = "https://github.com/henriquepedrohttp/cloud-ai-agent.git"
}