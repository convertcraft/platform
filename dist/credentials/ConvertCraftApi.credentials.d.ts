import type { ICredentialType, INodeProperties } from 'n8n-workflow';
export declare class ConvertCraftApi implements ICredentialType {
    name: string;
    displayName: string;
    documentationUrl: string;
    properties: INodeProperties[];
    authenticate: {
        type: "generic";
        properties: {
            headers: {
                'x-rapidapi-key': string;
                'x-rapidapi-host': string;
            };
        };
    };
}
