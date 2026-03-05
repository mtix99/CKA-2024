import React, { useEffect, useState, useCallback } from 'react';
import ForgeReconciler, { Text, Button, Spinner, Select, Table, Head, Row, Cell, SectionMessage } from '@forge/react';
import { invoke, requestJira } from '@forge/bridge';

const App = () => {
  const [authorized, setAuthorized] = useState(null); // null = loading
  const [workspaceId, setWorkspaceId] = useState(null);
  const [userOptions, setUserOptions] = useState([]);
  const [userSearch, setUserSearch] = useState('');
  const [selectedUser, setSelectedUser] = useState(null);
  const [loading, setLoading] = useState(false);
  const [results, setResults] = useState(null);
  const [error, setError] = useState(null);

  // 1. Authorization + workspace ID on mount
  useEffect(() => {
    (async () => {
      const { authorized } = await invoke('checkAuthorization');
      setAuthorized(authorized);
      if (authorized) {
        // Fetch the first Assets workspace ID
        const res = await requestJira('/gateway/api/jsm/assets/workspace');
        const data = await res.json();
        setWorkspaceId(data.values?.[0]?.workspaceId ?? null);
      }
    })();
  }, []);

  // 2. User search (debounced by typing)
  useEffect(() => {
    if (!authorized) return;
    const timer = setTimeout(async () => {
      const users = await invoke('searchUsers', { query: userSearch });
      setUserOptions(
        users.map(u => ({ label: u.displayName, value: u.accountId }))
      );
    }, 300);
    return () => clearTimeout(timer);
  }, [userSearch, authorized]);

  // 3. Run AQL query
  const handleCheck = useCallback(async () => {
    if (!selectedUser || !workspaceId) return;
    setLoading(true);
    setError(null);
    setResults(null);
    try {
      const data = await invoke('queryAssets', {
        accountId: selectedUser.value,
        workspaceId,
      });
      setResults(data);
    } catch (e) {
      setError('Failed to query Assets. Please try again.');
    } finally {
      setLoading(false);
    }
  }, [selectedUser, workspaceId]);

  // --- Render states ---
  if (authorized === null) return <Spinner />;

  if (!authorized) {
    return (
      <SectionMessage appearance="error" title="Access Denied">
        <Text>You do not have permission to use this feature. Contact your IT administrator.</Text>
      </SectionMessage>
    );
  }

  return (
    <>
      <Text><strong>Check User Assets</strong></Text>
      <Select
        label="Select a user"
        options={userOptions}
        onInputChange={setUserSearch}
        onChange={setSelectedUser}
        placeholder="Search for a user..."
        isClearable
      />
      <Button
        appearance="primary"
        isDisabled={!selectedUser || loading}
        onClick={handleCheck}
      >
        {loading ? 'Checking...' : 'Check'}
      </Button>

      {loading && <Spinner />}

      {error && (
        <SectionMessage appearance="error">
          <Text>{error}</Text>
        </SectionMessage>
      )}

      {results && (
        <>
          <Text><strong>Assets assigned to {selectedUser.label}</strong></Text>
          {results.referencingObjects.length === 0 ? (
            <Text>No assets found for this user.</Text>
          ) : (
            <Table>
              <Head>
                <Cell><Text>Name</Text></Cell>
                <Cell><Text>Object Type</Text></Cell>
                <Cell><Text>Object Key</Text></Cell>
              </Head>
              {results.referencingObjects.map(obj => (
                <Row key={obj.id}>
                  <Cell><Text>{obj.label}</Text></Cell>
                  <Cell><Text>{obj.objectType?.name ?? '—'}</Text></Cell>
                  <Cell><Text>{obj.objectKey}</Text></Cell>
                </Row>
              ))}
            </Table>
          )}
        </>
      )}
    </>
  );
};

ForgeReconciler.render(<App />);
