export enum FileUploadMode {
  SINGLE_FILE = 'single_file',
  MULTIPLE_FILES = 'multiple_files',
  ZIP_FILE = 'zip_file',
  PDF_FILE = 'pdf_file',
}

export enum IaCTemplateType {
  CLOUDFORMATION_YAML = 'CloudFormation (.yaml) template',
  CLOUDFORMATION_JSON = 'CloudFormation (.json) template',
  TERRAFORM = 'Terraform (.tf) document',
}
