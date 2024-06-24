// Copyright (c) Microsoft Corporation.
// Licensed under the MIT license.
import * as msal from "@azure/msal-node";
import { credentialLogger, formatSuccess } from "../../util/logging";
import { msalPlugins } from "./msalPlugins";
import { defaultLoggerCallback, ensureValidMsalToken, getAuthority, getKnownAuthorities, getMSALLogLevel, handleMsalError, msalToPublic, publicToMsal, } from "../utils";
import { AuthenticationRequiredError } from "../../errors";
import { IdentityClient } from "../../client/identityClient";
import { calculateRegionalAuthority } from "../../regionalAuthority";
import { getLogLevel } from "@azure/logger";
import { resolveTenantId } from "../../util/tenantIdUtils";
/**
 * The default logger used if no logger was passed in by the credential.
 */
const msalLogger = credentialLogger("MsalClient");
/**
 * Generates the configuration for MSAL (Microsoft Authentication Library).
 *
 * @param clientId - The client ID of the application.
 * @param  tenantId - The tenant ID of the Azure Active Directory.
 * @param  msalClientOptions - Optional. Additional options for creating the MSAL client.
 * @returns  The MSAL configuration object.
 */
export function generateMsalConfiguration(clientId, tenantId, msalClientOptions = {}) {
    var _a, _b, _c, _d;
    const resolvedTenant = resolveTenantId((_a = msalClientOptions.logger) !== null && _a !== void 0 ? _a : msalLogger, tenantId, clientId);
    // TODO: move and reuse getIdentityClientAuthorityHost
    const authority = getAuthority(resolvedTenant, (_b = msalClientOptions.authorityHost) !== null && _b !== void 0 ? _b : process.env.AZURE_AUTHORITY_HOST);
    const httpClient = new IdentityClient(Object.assign(Object.assign({}, msalClientOptions.tokenCredentialOptions), { authorityHost: authority, loggingOptions: msalClientOptions.loggingOptions }));
    const msalConfig = {
        auth: {
            clientId,
            authority,
            knownAuthorities: getKnownAuthorities(resolvedTenant, authority, msalClientOptions.disableInstanceDiscovery),
        },
        system: {
            networkClient: httpClient,
            loggerOptions: {
                loggerCallback: defaultLoggerCallback((_c = msalClientOptions.logger) !== null && _c !== void 0 ? _c : msalLogger),
                logLevel: getMSALLogLevel(getLogLevel()),
                piiLoggingEnabled: (_d = msalClientOptions.loggingOptions) === null || _d === void 0 ? void 0 : _d.enableUnsafeSupportLogging,
            },
        },
    };
    return msalConfig;
}
/**
 * Creates an instance of the MSAL (Microsoft Authentication Library) client.
 *
 * @param clientId - The client ID of the application.
 * @param tenantId - The tenant ID of the Azure Active Directory.
 * @param createMsalClientOptions - Optional. Additional options for creating the MSAL client.
 * @returns An instance of the MSAL client.
 *
 * @public
 */
export function createMsalClient(clientId, tenantId, createMsalClientOptions = {}) {
    var _a;
    const state = {
        msalConfig: generateMsalConfiguration(clientId, tenantId, createMsalClientOptions),
        cachedAccount: createMsalClientOptions.authenticationRecord
            ? publicToMsal(createMsalClientOptions.authenticationRecord)
            : null,
        pluginConfiguration: msalPlugins.generatePluginConfiguration(createMsalClientOptions),
        logger: (_a = createMsalClientOptions.logger) !== null && _a !== void 0 ? _a : msalLogger,
    };
    const publicApps = new Map();
    async function getPublicApp(options = {}) {
        const appKey = options.enableCae ? "CAE" : "default";
        let publicClientApp = publicApps.get(appKey);
        if (publicClientApp) {
            state.logger.getToken.info("Existing PublicClientApplication found in cache, returning it.");
            return publicClientApp;
        }
        // Initialize a new app and cache it
        state.logger.getToken.info(`Creating new PublicClientApplication with CAE ${options.enableCae ? "enabled" : "disabled"}.`);
        const cachePlugin = options.enableCae
            ? state.pluginConfiguration.cache.cachePluginCae
            : state.pluginConfiguration.cache.cachePlugin;
        state.msalConfig.auth.clientCapabilities = options.enableCae ? ["cp1"] : undefined;
        publicClientApp = new msal.PublicClientApplication(Object.assign(Object.assign({}, state.msalConfig), { broker: { nativeBrokerPlugin: state.pluginConfiguration.broker.nativeBrokerPlugin }, cache: { cachePlugin: await cachePlugin } }));
        publicApps.set(appKey, publicClientApp);
        return publicClientApp;
    }
    const confidentialApps = new Map();
    async function getConfidentialApp(options = {}) {
        const appKey = options.enableCae ? "CAE" : "default";
        let confidentialClientApp = confidentialApps.get(appKey);
        if (confidentialClientApp) {
            state.logger.getToken.info("Existing ConfidentialClientApplication found in cache, returning it.");
            return confidentialClientApp;
        }
        // Initialize a new app and cache it
        state.logger.getToken.info(`Creating new ConfidentialClientApplication with CAE ${options.enableCae ? "enabled" : "disabled"}.`);
        const cachePlugin = options.enableCae
            ? state.pluginConfiguration.cache.cachePluginCae
            : state.pluginConfiguration.cache.cachePlugin;
        state.msalConfig.auth.clientCapabilities = options.enableCae ? ["cp1"] : undefined;
        confidentialClientApp = new msal.ConfidentialClientApplication(Object.assign(Object.assign({}, state.msalConfig), { broker: { nativeBrokerPlugin: state.pluginConfiguration.broker.nativeBrokerPlugin }, cache: { cachePlugin: await cachePlugin } }));
        confidentialApps.set(appKey, confidentialClientApp);
        return confidentialClientApp;
    }
    async function getTokenSilent(app, scopes, options = {}) {
        if (state.cachedAccount === null) {
            state.logger.getToken.info("No cached account found in local state, attempting to load it from MSAL cache.");
            const cache = app.getTokenCache();
            const accounts = await cache.getAllAccounts();
            if (accounts === undefined || accounts.length === 0) {
                throw new AuthenticationRequiredError({ scopes });
            }
            if (accounts.length > 1) {
                state.logger
                    .info(`More than one account was found authenticated for this Client ID and Tenant ID.
However, no "authenticationRecord" has been provided for this credential,
therefore we're unable to pick between these accounts.
A new login attempt will be requested, to ensure the correct account is picked.
To work with multiple accounts for the same Client ID and Tenant ID, please provide an "authenticationRecord" when initializing a credential to prevent this from happening.`);
                throw new AuthenticationRequiredError({ scopes });
            }
            state.cachedAccount = accounts[0];
        }
        // Keep track and reuse the claims we received across challenges
        if (options.claims) {
            state.cachedClaims = options.claims;
        }
        const silentRequest = {
            account: state.cachedAccount,
            scopes,
            claims: state.cachedClaims,
        };
        if (state.pluginConfiguration.broker.isEnabled) {
            silentRequest.tokenQueryParameters || (silentRequest.tokenQueryParameters = {});
            if (state.pluginConfiguration.broker.enableMsaPassthrough) {
                silentRequest.tokenQueryParameters["msal_request_type"] = "consumer_passthrough";
            }
        }
        state.logger.getToken.info("Attempting to acquire token silently");
        return app.acquireTokenSilent(silentRequest);
    }
    /**
     * Performs silent authentication using MSAL to acquire an access token.
     * If silent authentication fails, falls back to interactive authentication.
     *
     * @param msalApp - The MSAL application instance.
     * @param scopes - The scopes for which to acquire the access token.
     * @param options - The options for acquiring the access token.
     * @param onAuthenticationRequired - A callback function to handle interactive authentication when silent authentication fails.
     * @returns A promise that resolves to an AccessToken object containing the access token and its expiration timestamp.
     */
    async function withSilentAuthentication(msalApp, scopes, options, onAuthenticationRequired) {
        var _a;
        let response = null;
        try {
            response = await getTokenSilent(msalApp, scopes, options);
        }
        catch (e) {
            if (e.name !== "AuthenticationRequiredError") {
                throw e;
            }
            if (options.disableAutomaticAuthentication) {
                throw new AuthenticationRequiredError({
                    scopes,
                    getTokenOptions: options,
                    message: "Automatic authentication has been disabled. You may call the authentication() method.",
                });
            }
        }
        // Silent authentication failed
        if (response === null) {
            try {
                response = await onAuthenticationRequired();
            }
            catch (err) {
                throw handleMsalError(scopes, err, options);
            }
        }
        // At this point we should have a token, process it
        ensureValidMsalToken(scopes, response, options);
        state.cachedAccount = (_a = response === null || response === void 0 ? void 0 : response.account) !== null && _a !== void 0 ? _a : null;
        state.logger.getToken.info(formatSuccess(scopes));
        return {
            token: response.accessToken,
            expiresOnTimestamp: response.expiresOn.getTime(),
        };
    }
    async function getTokenByClientSecret(scopes, clientSecret, options = {}) {
        state.logger.getToken.info(`Attempting to acquire token using client secret`);
        state.msalConfig.auth.clientSecret = clientSecret;
        const msalApp = await getConfidentialApp(options);
        try {
            const response = await msalApp.acquireTokenByClientCredential({
                scopes,
                authority: state.msalConfig.auth.authority,
                azureRegion: calculateRegionalAuthority(),
                claims: options === null || options === void 0 ? void 0 : options.claims,
            });
            ensureValidMsalToken(scopes, response, options);
            state.logger.getToken.info(formatSuccess(scopes));
            return {
                token: response.accessToken,
                expiresOnTimestamp: response.expiresOn.getTime(),
            };
        }
        catch (err) {
            throw handleMsalError(scopes, err, options);
        }
    }
    async function getTokenByClientAssertion(scopes, clientAssertion, options = {}) {
        state.logger.getToken.info(`Attempting to acquire token using client assertion`);
        state.msalConfig.auth.clientAssertion = clientAssertion;
        const msalApp = await getConfidentialApp(options);
        try {
            const response = await msalApp.acquireTokenByClientCredential({
                scopes,
                authority: state.msalConfig.auth.authority,
                azureRegion: calculateRegionalAuthority(),
                claims: options === null || options === void 0 ? void 0 : options.claims,
                clientAssertion,
            });
            ensureValidMsalToken(scopes, response, options);
            state.logger.getToken.info(formatSuccess(scopes));
            return {
                token: response.accessToken,
                expiresOnTimestamp: response.expiresOn.getTime(),
            };
        }
        catch (err) {
            throw handleMsalError(scopes, err, options);
        }
    }
    async function getTokenByClientCertificate(scopes, certificate, options = {}) {
        state.logger.getToken.info(`Attempting to acquire token using client certificate`);
        state.msalConfig.auth.clientCertificate = certificate;
        const msalApp = await getConfidentialApp(options);
        try {
            const response = await msalApp.acquireTokenByClientCredential({
                scopes,
                authority: state.msalConfig.auth.authority,
                azureRegion: calculateRegionalAuthority(),
                claims: options === null || options === void 0 ? void 0 : options.claims,
            });
            ensureValidMsalToken(scopes, response, options);
            state.logger.getToken.info(formatSuccess(scopes));
            return {
                token: response.accessToken,
                expiresOnTimestamp: response.expiresOn.getTime(),
            };
        }
        catch (err) {
            throw handleMsalError(scopes, err, options);
        }
    }
    async function getTokenByDeviceCode(scopes, deviceCodeCallback, options = {}) {
        state.logger.getToken.info(`Attempting to acquire token using device code`);
        const msalApp = await getPublicApp(options);
        return withSilentAuthentication(msalApp, scopes, options, () => {
            var _a, _b;
            const requestOptions = {
                scopes,
                cancel: (_b = (_a = options === null || options === void 0 ? void 0 : options.abortSignal) === null || _a === void 0 ? void 0 : _a.aborted) !== null && _b !== void 0 ? _b : false,
                deviceCodeCallback,
                authority: state.msalConfig.auth.authority,
                claims: options === null || options === void 0 ? void 0 : options.claims,
            };
            const deviceCodeRequest = msalApp.acquireTokenByDeviceCode(requestOptions);
            if (options.abortSignal) {
                options.abortSignal.addEventListener("abort", () => {
                    requestOptions.cancel = true;
                });
            }
            return deviceCodeRequest;
        });
    }
    async function getTokenByUsernamePassword(scopes, username, password, options = {}) {
        state.logger.getToken.info(`Attempting to acquire token using username and password`);
        const msalApp = await getPublicApp(options);
        return withSilentAuthentication(msalApp, scopes, options, () => {
            const requestOptions = {
                scopes,
                username,
                password,
                authority: state.msalConfig.auth.authority,
                claims: options === null || options === void 0 ? void 0 : options.claims,
            };
            return msalApp.acquireTokenByUsernamePassword(requestOptions);
        });
    }
    function getActiveAccount() {
        if (!state.cachedAccount) {
            return undefined;
        }
        return msalToPublic(clientId, state.cachedAccount);
    }
    async function getTokenByAuthorizationCode(scopes, redirectUri, authorizationCode, clientSecret, options = {}) {
        state.logger.getToken.info(`Attempting to acquire token using authorization code`);
        let msalApp;
        if (clientSecret) {
            // If a client secret is provided, we need to use a confidential client application
            // See https://learn.microsoft.com/entra/identity-platform/v2-oauth2-auth-code-flow#request-an-access-token-with-a-client_secret
            state.msalConfig.auth.clientSecret = clientSecret;
            msalApp = await getConfidentialApp(options);
        }
        else {
            msalApp = await getPublicApp(options);
        }
        return withSilentAuthentication(msalApp, scopes, options, () => {
            return msalApp.acquireTokenByCode({
                scopes,
                redirectUri,
                code: authorizationCode,
                authority: state.msalConfig.auth.authority,
                claims: options === null || options === void 0 ? void 0 : options.claims,
            });
        });
    }
    return {
        getActiveAccount,
        getTokenByClientSecret,
        getTokenByClientAssertion,
        getTokenByClientCertificate,
        getTokenByDeviceCode,
        getTokenByUsernamePassword,
        getTokenByAuthorizationCode,
    };
}
//# sourceMappingURL=msalClient.js.map