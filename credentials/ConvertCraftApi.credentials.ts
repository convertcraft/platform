import type { ICredentialType, INodeProperties } from 'n8n-workflow';

export class ConvertCraftApi implements ICredentialType {
  name = 'convertCraftApi';

  displayName = 'ConvertCraft API';

  documentationUrl = 'https://rapidapi.com';

  properties: INodeProperties[] = [
    {
      displayName: 'API Key',
      name: 'apiKey',
      type: 'string',
      typeOptions: {
        password: true,
      },
      default: '',
      required: true,
      description: 'Your RapidAPI key for ConvertCraft',
    },
    {
      displayName: 'RapidAPI Host',
      name: 'rapidApiHost',
      type: 'string',
      default: 'convertcraft-tools.p.rapidapi.com',
      required: true,
      description: 'The RapidAPI host for ConvertCraft',
    },
    {
      displayName: 'Base URL',
      name: 'baseUrl',
      type: 'string',
      default: 'https://convertcraft-tools.p.rapidapi.com',
      required: true,
      description: 'Base URL used for ConvertCraft API requests',
    },
  ];

  authenticate = {
    type: 'generic' as const,
    properties: {
      headers: {
        'x-rapidapi-key': '={{$credentials.apiKey}}',
        'x-rapidapi-host': '={{$credentials.rapidApiHost}}',
      },
    },
  };
}
