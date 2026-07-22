import { useState } from 'react';
import { supabase } from '../supabaseClient';

export default function Login() {
  const [modo, setModo] = useState('entrar'); // 'entrar' | 'cadastrar'
  const [email, setEmail] = useState('');
  const [senha, setSenha] = useState('');
  const [erro, setErro] = useState('');
  const [aviso, setAviso] = useState('');
  const [carregando, setCarregando] = useState(false);

  async function handleSubmit(e) {
    e.preventDefault();
    setErro('');
    setAviso('');
    setCarregando(true);
    try {
      if (modo === 'entrar') {
        const { error } = await supabase.auth.signInWithPassword({ email, password: senha });
        if (error) throw error;
      } else {
        const { error } = await supabase.auth.signUp({ email, password: senha });
        if (error) throw error;
        setAviso('Conta criada! Verifique seu e-mail para confirmar o cadastro (se a confirmação estiver ativada no seu projeto Supabase), depois faça login.');
      }
    } catch (err) {
      setErro(err.message || 'Não foi possível completar a ação.');
    } finally {
      setCarregando(false);
    }
  }

  return (
    <div className="login-wrap">
      <div className="login-card">
        <h1 className="display">Meta<span style={{ color: 'var(--teal)' }}>70</span></h1>
        <p>Controle financeiro e cobrança pessoal.</p>
        <form onSubmit={handleSubmit}>
          <div>
            <label>E-mail</label>
            <input type="email" value={email} onChange={e => setEmail(e.target.value)} required />
          </div>
          <div>
            <label>Senha</label>
            <input type="password" value={senha} onChange={e => setSenha(e.target.value)} required minLength={6} />
          </div>
          {erro && <div className="error-msg">{erro}</div>}
          {aviso && <div className="error-msg" style={{ background: 'var(--teal-soft)', color: 'var(--teal)' }}>{aviso}</div>}
          <button className="btn-primary" type="submit" disabled={carregando}>
            {carregando ? 'Aguarde...' : modo === 'entrar' ? 'Entrar' : 'Criar conta'}
          </button>
        </form>
        <div style={{ marginTop: 16, textAlign: 'center' }}>
          <button className="link-btn" onClick={() => { setModo(modo === 'entrar' ? 'cadastrar' : 'entrar'); setErro(''); setAviso(''); }}>
            {modo === 'entrar' ? 'Não tem conta? Criar uma agora' : 'Já tem conta? Entrar'}
          </button>
        </div>
      </div>
    </div>
  );
}
