import {
	NodeApiError,
	type IDataObject,
	type IExecuteFunctions,
	type INodeExecutionData,
	type INodeProperties,
	type INodeType,
	type INodeTypeDescription,
	type JsonObject,
} from 'n8n-workflow';

type ConvertCraftResource = 'pdf' | 'image';

type ConvertCraftOperation = 'convert' | 'compress' | 'resize';

type OutputMode = 'simplified' | 'raw' | 'selected';

function toDataObject(value: unknown): IDataObject {
	if (value !== null && typeof value === 'object' && !Array.isArray(value)) {
		return value as IDataObject;
	}

	return { value: value as IDataObject[string] };
}

function simplifyResponse(data: IDataObject, maxFields = 10): IDataObject {
	const entries = Object.entries(data).slice(0, maxFields);
	return Object.fromEntries(entries);
}

function flattenResponse(response: IDataObject): IDataObject {
	const result: IDataObject = { ...response };
	const nestedData = response.data;

	if (nestedData !== null && typeof nestedData === 'object' && !Array.isArray(nestedData)) {
		Object.assign(result, nestedData as IDataObject);
	}

	return result;
}

function selectedFieldsResponse(data: IDataObject, selectedFields: string[]): IDataObject {
	const picked: IDataObject = {};

	for (const key of selectedFields) {
		if (key in data) {
			picked[key] = data[key];
		}
	}

	return picked;
}

function formatOutput(response: IDataObject, outputMode: OutputMode, selectedFields: string[]): IDataObject {
	if (outputMode === 'raw') {
		return response;
	}

	const flattened = flattenResponse(response);

	if (outputMode === 'selected') {
		return selectedFieldsResponse(flattened, selectedFields);
	}

	return simplifyResponse(flattened, 10);
}

function getUserFacingError(error: unknown, itemIndex: number): { message: string; description: string } {
	const fallback = {
		message: `The conversion request could not be completed [item ${itemIndex}]`,
		description:
			'Check that the file URL is publicly accessible, that required parameters are set, and that the selected format is supported, then retry.',
	};

	if (!error || typeof error !== 'object') {
		return fallback;
	}

	const maybeError = error as IDataObject;
	const statusCode = Number(maybeError.statusCode ?? 0);
	const body = toDataObject(maybeError.response);
	const responseData = toDataObject(body.body);
	const responseMessage =
		typeof responseData.message === 'string'
			? responseData.message
			: typeof maybeError.message === 'string'
				? maybeError.message
				: '';

	if (statusCode === 400 && responseMessage.toLowerCase().includes('format')) {
		return {
			message: `The selected output format is not supported [item ${itemIndex}]`,
			description: 'Supported formats for this operation are listed in the Output Format parameter. Choose one and retry.',
		};
	}

	if (statusCode === 400 && responseMessage.toLowerCase().includes('size')) {
		return {
			message: `The requested image dimensions are not valid [item ${itemIndex}]`,
			description: 'Set Width and Height to valid positive integers and retry the request.',
		};
	}

	if (statusCode === 400 && responseMessage.toLowerCase().includes('url')) {
		return {
			message: `The file at the provided URL could not be accessed [item ${itemIndex}]`,
			description:
				'Check that the URL is publicly accessible and try again. If the file is behind authentication, use a pre-signed URL.',
		};
	}

	if (statusCode === 401 || statusCode === 403) {
		return {
			message: `The ConvertCraft credentials were rejected [item ${itemIndex}]`,
			description:
				'Check the API Key and RapidAPI Host in your ConvertCraft API credentials, then run the node again.',
		};
	}

	if (statusCode === 404) {
		return {
			message: `The requested ConvertCraft operation is not available [item ${itemIndex}]`,
			description: 'Check that the selected Resource and Operation are supported by your current API plan.',
		};
	}

	return fallback;
}

export class ConvertCraft implements INodeType {
	description: INodeTypeDescription = {
		displayName: 'ConvertCraft',
		name: 'convertCraft',
		icon: 'file:convertCraft.svg',
		group: ['transform'],
		version: 1,
		subtitle: '={{$parameter["resource"] + ": " + $parameter["operation"]}}',
		description: 'Convert files with ConvertCraft',
		defaults: {
			name: 'ConvertCraft',
		},
		inputs: ['main'],
		outputs: ['main'],
		credentials: [
			{
				name: 'convertCraftApi',
				required: true,
			},
		],
		properties: [
			{
				displayName: 'Resource',
				name: 'resource',
				type: 'options',
				noDataExpression: true,
				default: 'pdf',
				options: [
					{
						name: 'PDF',
						value: 'pdf',
					},
					{
						name: 'Image',
						value: 'image',
					},
				],
				description: 'The file type to process',
			},
			{
				displayName: 'Operation',
				name: 'operation',
				type: 'options',
				noDataExpression: true,
				default: 'convert',
				displayOptions: {
					show: {
						resource: ['pdf'],
					},
				},
				options: [
					{
						name: 'Convert',
						value: 'convert',
						action: 'Convert PDF to Word',
						description: 'Transform a PDF file into an editable output format',
					},
					{
						name: 'Compress',
						value: 'compress',
						action: 'Compress PDF',
						description: 'Reduce PDF file size while maintaining quality',
					},
				],
				description: 'The action to perform on the selected resource',
			},
			{
				displayName: 'Operation',
				name: 'operation',
				type: 'options',
				noDataExpression: true,
				default: 'convert',
				displayOptions: {
					show: {
						resource: ['image'],
					},
				},
				options: [
					{
						name: 'Convert',
						value: 'convert',
						action: 'Convert image format',
						description: 'Change an image format such as JPG, PNG, WebP, or AVIF',
					},
					{
						name: 'Resize',
						value: 'resize',
						action: 'Resize image',
						description: 'Adjust image dimensions with fit options',
					},
				],
				description: 'The action to perform on the selected resource',
			},
			{
				displayName: 'File URL',
				name: 'fileUrl',
				type: 'string',
				required: true,
				default: '',
				placeholder: 'e.g. https://example.com/document.pdf',
				description: 'URL of the source file to convert',
			},
			{
				displayName: 'Output Format',
				name: 'outputFormat',
				type: 'options',
				default: 'docx',
				displayOptions: {
					show: {
						resource: ['pdf'],
						operation: ['convert'],
					},
				},
				options: [
					{
						name: 'Word (DOCX)',
						value: 'docx',
					},
					{
						name: 'Plain Text',
						value: 'txt',
					},
					{
						name: 'HTML',
						value: 'html',
					},
				],
				description: 'Format to convert the PDF into',
			},
			{
				displayName: 'Output Format',
				name: 'outputFormat',
				type: 'options',
				default: 'webp',
				displayOptions: {
					show: {
						resource: ['image'],
						operation: ['convert'],
					},
				},
				options: [
					{
						name: 'JPG',
						value: 'jpg',
					},
					{
						name: 'PNG',
						value: 'png',
					},
					{
						name: 'WebP',
						value: 'webp',
					},
					{
						name: 'AVIF',
						value: 'avif',
					},
				],
				description: 'Format to convert the image into',
			},
			{
				displayName: 'Compression Level',
				name: 'compressionLevel',
				type: 'options',
				default: 'medium',
				displayOptions: {
					show: {
						resource: ['pdf'],
						operation: ['compress'],
					},
				},
				options: [
					{
						name: 'Low',
						value: 'low',
					},
					{
						name: 'Medium',
						value: 'medium',
					},
					{
						name: 'High',
						value: 'high',
					},
				],
				description: 'Compression level to apply to the PDF file',
			},
			{
				displayName: 'Width',
				name: 'width',
				type: 'number',
				default: 1920,
				typeOptions: {
					minValue: 1,
				},
				displayOptions: {
					show: {
						resource: ['image'],
						operation: ['resize'],
					},
				},
				description: 'Target width for the resized image in pixels',
			},
			{
				displayName: 'Height',
				name: 'height',
				type: 'number',
				default: 1080,
				typeOptions: {
					minValue: 1,
				},
				displayOptions: {
					show: {
						resource: ['image'],
						operation: ['resize'],
					},
				},
				description: 'Target height for the resized image in pixels',
			},
			{
				displayName: 'Fit',
				name: 'fit',
				type: 'options',
				default: 'contain',
				displayOptions: {
					show: {
						resource: ['image'],
						operation: ['resize'],
					},
				},
				options: [
					{
						name: 'Contain',
						value: 'contain',
					},
					{
						name: 'Cover',
						value: 'cover',
					},
					{
						name: 'Fill',
						value: 'fill',
					},
				],
				description: 'Fit mode to use when resizing the image',
			},
			{
				displayName: 'Output',
				name: 'outputMode',
				type: 'options',
				default: 'simplified',
				options: [
					{
						name: 'Simplified',
						value: 'simplified',
					},
					{
						name: 'Raw',
						value: 'raw',
					},
					{
						name: 'Selected Fields',
						value: 'selected',
					},
				],
				description: 'How much data to return from the ConvertCraft response',
			},
			{
				displayName: 'Fields',
				name: 'selectedFields',
				type: 'multiOptions',
				default: ['outputUrl'],
				displayOptions: {
					show: {
						outputMode: ['selected'],
					},
				},
				options: [
					{
						name: 'Output URL',
						value: 'outputUrl',
					},
					{
						name: 'Original Size',
						value: 'originalSize',
					},
					{
						name: 'Converted Size',
						value: 'convertedSize',
					},
					{
						name: 'Processing Time',
						value: 'processingTime',
					},
					{
						name: 'Format',
						value: 'format',
					},
					{
						name: 'Pages',
						value: 'pages',
					},
					{
						name: 'Text',
						value: 'text',
					},
					{
						name: 'Width',
						value: 'width',
					},
					{
						name: 'Height',
						value: 'height',
					},
					{
						name: 'MIME Type',
						value: 'mimeType',
					},
					{
						name: 'Success',
						value: 'success',
					},
					{
						name: 'Message',
						value: 'message',
					},
				],
				description: 'Fields to include when Selected Fields output mode is used',
			},
			{
				displayName: 'Simplify',
				name: 'simplify',
				type: 'boolean',
				default: true,
				displayOptions: {
					show: {
						outputMode: ['simplified'],
					},
				},
				description: 'Whether to return a simplified response with up to 10 fields',
			},
		] as INodeProperties[],
	};

	async execute(this: IExecuteFunctions): Promise<INodeExecutionData[][]> {
		const items = this.getInputData();
		const returnData: INodeExecutionData[] = [];
		const credentials = await this.getCredentials('convertCraftApi');
		const baseUrl = String(credentials.baseUrl ?? 'https://convertcraft-tools.p.rapidapi.com').replace(/\/+$/, '');

		for (let i = 0; i < items.length; i++) {
			try {
				const resource = this.getNodeParameter('resource', i) as ConvertCraftResource;
				const operation = this.getNodeParameter('operation', i) as ConvertCraftOperation;
				const fileUrl = this.getNodeParameter('fileUrl', i) as string;
				const outputMode = this.getNodeParameter('outputMode', i, 'simplified') as OutputMode;
				const selectedFields = this.getNodeParameter('selectedFields', i, ['outputUrl']) as string[];

				const endpointPathByResource: Record<ConvertCraftResource, Partial<Record<ConvertCraftOperation, string>>> = {
					pdf: {
						convert: '/pdf-to-word',
						compress: '/compress-pdf',
					},
					image: {
						convert: '/image-convert',
						resize: '/image-resize',
					},
				};

				const endpointPath = endpointPathByResource[resource][operation];

				if (!endpointPath) {
					throw new Error(`No endpoint mapping found for ${resource}:${operation}`);
				}

				const body: IDataObject = {
					fileUrl,
					file_url: fileUrl,
					sourceUrl: fileUrl,
					source_url: fileUrl,
					url: fileUrl,
				};

				if (resource === 'pdf' && operation === 'convert') {
					const outputFormat = this.getNodeParameter('outputFormat', i) as string;
					body.outputFormat = outputFormat;
					body.output_format = outputFormat;
					body.format = outputFormat;
				}

				if (resource === 'pdf' && operation === 'compress') {
					body.compressionLevel = this.getNodeParameter('compressionLevel', i, 'medium') as string;
				}

				if (resource === 'image' && operation === 'convert') {
					const outputFormat = this.getNodeParameter('outputFormat', i) as string;
					body.outputFormat = outputFormat;
					body.output_format = outputFormat;
					body.format = outputFormat;
				}

				if (resource === 'image' && operation === 'resize') {
					const width = this.getNodeParameter('width', i) as number;
					const height = this.getNodeParameter('height', i) as number;
					const fit = this.getNodeParameter('fit', i, 'contain') as string;
					body.width = width;
					body.height = height;
					body.fit = fit;
					body.w = width;
					body.h = height;
					body.mode = fit;
				}

				const response = (await this.helpers.httpRequestWithAuthentication.call(this, 'convertCraftApi', {
					method: 'POST',
					url: `${baseUrl}${endpointPath}`,
					body,
					json: true,
				})) as IDataObject;

				const payload = formatOutput(response, outputMode, selectedFields);
				returnData.push({ json: payload });
			} catch (error) {
				const userFacing = getUserFacingError(error, i);

				if (this.continueOnFail()) {
					returnData.push({
						json: {
							message: userFacing.message,
							description: userFacing.description,
						},
						pairedItem: {
							item: i,
						},
					});
					continue;
				}

				throw new NodeApiError(this.getNode(), error as JsonObject, {
					message: userFacing.message,
					description: userFacing.description,
				});
			}
		}

		return [returnData];
	}
}
