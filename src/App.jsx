import { useEffect, useState } from 'react';
import { supabase } from './supabaseClient';
import Login from './components/Login';
import MetaTab from './components/MetaTab';

export default function App() {
  const [session, setSession] = useState(undefined); // undefined = ainda checando

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

  return <Dashboard userId={session.user.id} />;
}

function Dashboard({ userId }) {
  const [config, setConfig] = useState(null);
  const [lancamentos, setLancamentos] = useState([]);
  const [contas, setContas] = useState([]);
  const [pagamentos, setPagamentos] = useState([]);
  const [carregando, setCarregando] = useState(true);

  useEffect(() => { carregar(); }, []);

  async function carregar() {
    setCarregando(true);
    let { data: configs } = await supabase.from('configuracoes').select('*').eq('user_id', userId).limit(1);
    let cfg;
    if (configs && configs.length) {
      cfg = configs[0];
    } else {
      const dataFim = new Date();
      dataFim.setFullYear(dataFim.getFullYear() + 2);
      const { data: novo } = await supabase.from('configuracoes')
        .insert({ user_id: userId, data_fim: dataFim.toISOString().slice(0, 10) })
        .select().single();
      cfg = novo;
    }
    setConfig(cfg);

    const { data: lts } = await supabase.from('lancamentos').select('*').eq('user_id', userId).order('data', { ascending: false });
    const { data: cts } = await supabase.from('contas').select('*').eq('user_id', userId).order('created_at', { ascending: false });
    const { data: pgs } = await supabase.from('pagamentos_conta').select('*').eq('user_id', userId);

    setLancamentos(lts || []);
    setContas(cts || []);
    setPagamentos(pgs || []);
    setCarregando(false);
  }

  if (carregando || !config) {
    return <div className="empty" style={{ padding: 60, textAlign: 'center' }}>Carregando seus dados...</div>;
  }

  return (
    <div className="wrap">
      <header>
        <h1 className="display">Meta<span>70</span> · Minhas Contas</h1>
        <button className="logout-btn" onClick={() => supabase.auth.signOut()}>Sair</button>
      </header>

      <MetaTab
        userId={userId}
        config={config} setConfig={setConfig}
        lancamentos={lancamentos} setLancamentos={setLancamentos}
        contas={contas} setContas={setContas}
        pagamentos={pagamentos} setPagamentos={setPagamentos}
      />
    </div>
  );
}
