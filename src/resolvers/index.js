import Resolver from '@forge/resolver';
import api, { route, asApp } from '@forge/api';

const resolver = new Resolver();

const ALLOWED_GROUP = process.env.ALLOWED_GROUP || 'it-asset-managers';

// 1. Authorization check
resolver.define('checkAuthorization', async ({ context }) => {
  const accountId = context.accountId;
  const res = await api
    .asUser()
    .requestJira(route`/rest/api/3/user/groups?accountId=${accountId}`);
  const groups = await res.json();
  const authorized = groups.some(g => g.name === ALLOWED_GROUP);
  return { authorized };
});

// 2. Search all Jira users including customers
resolver.define('searchUsers', async ({ payload }) => {
  const { query = '' } = payload;
  // Use the user-search endpoint with includeCustomers flag
  const res = await api
    .asApp()
    .requestJira(
      route`/rest/api/3/user/search?query=${query}&maxResults=50&includeCustomers=true`
    );
  const users = await res.json();
  return users.map(u => ({
    accountId: u.accountId,
    displayName: u.displayName,
    avatarUrl: u.avatarUrls?.['24x24'] ?? null,
  }));
});

// 3. AQL query against Assets for selected user
resolver.define('queryAssets', async ({ payload }) => {
  const { accountId, workspaceId } = payload;
  // AQL: find all objects whose User attribute references this user's object
  const aql = `objectType = User AND "Jira User" = "${accountId}" ORDER BY Name`;
  const res = await api
    .asApp()
    .requestJira(
      route`/gateway/api/jsm/assets/workspace/${workspaceId}/v1/aql/objects`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ qlQuery: aql, maxResults: 100 }),
      }
    );
  const data = await res.json();
  // Also fetch objects that REFERENCE this User object (incoming refs)
  // Second query: objects with an attribute pointing to the resolved User objectId
  const userObjRes = await api
    .asApp()
    .requestJira(
      route`/gateway/api/jsm/assets/workspace/${workspaceId}/v1/aql/objects`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          qlQuery: `object HAVING inboundReferences(objectType = User AND "Jira User" = "${accountId}")`,
          maxResults: 100,
        }),
      }
    );
  const refData = await userObjRes.json();
  return {
    userObjects: data.values ?? [],
    referencingObjects: refData.values ?? [],
  };
});

export const handler = resolver.getDefinitions();
