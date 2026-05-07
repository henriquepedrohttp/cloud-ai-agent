output "instance_id" {
  description = "ID da instância EC2"
  value       = aws_instance.web.id
}

output "public_ip" {
  description = "IP público da instância"
  value       = aws_instance.web.public_ip
}

output "ami_id" {
  description = "AMI utilizada"
  value       = data.aws_ami.ubuntu.id
}

output "instance_state" {
  description = "Estado da instância"
  value       = aws_instance.web.instance_state
}