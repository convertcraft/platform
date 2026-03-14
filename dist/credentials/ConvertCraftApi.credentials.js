"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.ConvertCraftApi = void 0;
class ConvertCraftApi {
    constructor() {
        this.name = 'convertCraftApi';
        this.displayName = 'ConvertCraft API';
        this.documentationUrl = 'https://rapidapi.com';
        this.properties = [
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
        this.authenticate = {
            type: 'generic',
            properties: {
                headers: {
                    'x-rapidapi-key': '={{$credentials.apiKey}}',
                    'x-rapidapi-host': '={{$credentials.rapidApiHost}}',
                },
            },
        };
    }
}
exports.ConvertCraftApi = ConvertCraftApi;
