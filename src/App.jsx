import { useEffect, useState } from 'react';
import { supabase } from './supabaseClient';
import Login from './components/Login';
import MetaTab from './components/MetaTab';
import CrmTab from './components/CrmTab';

export default function App() {
  const [session, setSession] = useState(undefined); // undefined = ainda checando
  const [tab, setTab] = useState('meta');

  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => setSession(data.session));
    const { data: listener } = supabase.auth.onAuthStateChange((_event, novaSession) => {
      setSession(novaSession);
    });
    return () => listener.subscription.unsubscribe();
  }, []);

  if (session === undefined) {
    return <div className="empty" style={{ padding: 60, textAlign: 'center' }}>Carregando...</div>;
  }

  if (!session) {
    return <Login />;
  }

  return (
    <div className="wrap">
      <header>
        <h1 className="display">Meta<span>70</span> · Controle &amp; Cobrança</h1>
        <button className="logout-btn" onClick={() => supabase.auth.signOut()}>Sair</button>
      </header>

      <div className="top-tabs">
        <button className={`top-tab ${tab === 'meta' ? 'active' : ''}`} onClick={() => setTab('meta')}>Meta &amp; Fluxo</button>
        <button className={`top-tab ${tab === 'crm' ? 'active' : ''}`} onClick={() => setTab('crm')}>CRM de Cobrança</button>
      </div>

      {tab === 'meta' ? <MetaTab userId={session.user.id} /> : <CrmTab userId={session.user.id} />}
    </div>
  );
}
