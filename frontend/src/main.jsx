import React, { createContext, useContext, useState, useEffect, useRef, useCallback } from 'react';
import { createRoot } from 'react-dom/client';
import { BrowserRouter, Routes, Route, Navigate, Link, useNavigate } from 'react-router-dom';
import { io } from 'socket.io-client';
import {
  MessageSquare,
  Search,
  Plus,
  Users,
  LogOut,
  Send,
  ImagePlus,
  X,
  ChevronLeft,
  Info,
  Check,
  CheckCheck,
  Sparkles,
  LoaderCircle,
  ShieldCheck,
  AlertCircle,
  Smile,
  MessagesSquare,
  UserPlus,
} from 'lucide-react';
import { API_URL, request, mergeMessages, conversationName, initials } from './api.js';
import './style.css';

const AuthContext = createContext(null);
function AuthProvider({ children }) {
  const [session, setSession] = useState(() => {
    try {
      return JSON.parse(sessionStorage.getItem('sapphire-session'));
    } catch {
      return null;
    }
  });
  const [checking, setChecking] = useState(!!session);
  const [authError, setAuthError] = useState('');
  const logout = useCallback(() => {
    sessionStorage.removeItem('sapphire-session');
    setSession(null);
    setChecking(false);
  }, []);
  const login = (data) => {
    sessionStorage.setItem('sapphire-session', JSON.stringify(data));
    setSession(data);
    setAuthError('');
    setChecking(false);
  };
  useEffect(() => {
    const expire = () => {
      logout();
      setAuthError('Your session expired. Please sign in again.');
    };
    window.addEventListener('session-expired', expire);
    return () => window.removeEventListener('session-expired', expire);
  }, [logout]);
  useEffect(() => {
    if (!session?.token) return;
    let live = true;
    request('/auth/me', { token: session.token })
      .then((user) => {
        if (live) setSession((s) => ({ ...s, user }));
      })
      .catch((error) => {
        if (live) {
          if (error.status === 401) logout();
          else setAuthError('Could not reach the server. Reconnect to continue.');
        }
      })
      .finally(() => {
        if (live) setChecking(false);
      });
    return () => {
      live = false;
    };
  }, [session?.token, logout]);
  return (
    <AuthContext.Provider value={{ ...session, login, logout, checking, authError }}>
      {children}
    </AuthContext.Provider>
  );
}
function Avatar({ name, group = false, online = false, small = false }) {
  const color = (name || '').split('').reduce((n, c) => n + c.charCodeAt(0), 0) % 5;
  return (
    <span
      className={`avatar color-${color} ${group ? 'group-avatar' : ''} ${small ? 'small' : ''}`}
      aria-label={online ? `${name} is online` : undefined}
    >
      {group ? <Users size={small ? 17 : 22} /> : initials(name)}
      {online && <i />}
    </span>
  );
}
const Spinner = () => <LoaderCircle className="spin" size={20} aria-label="Loading" />;
function Logo() {
  return (
    <div className="logo">
      <span>
        <MessageSquare size={24} fill="currentColor" />
      </span>
      <div>orphchat</div>
    </div>
  );
}
function AuthPage({ register = false }) {
  const auth = useContext(AuthContext);
  const navigate = useNavigate();
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  if (auth.token) return <Navigate to="/chat" replace />;
  async function submit(event) {
    event.preventDefault();
    setBusy(true);
    setError('');
    const body = Object.fromEntries(new FormData(event.currentTarget));
    try {
      auth.login(
        await request(`/auth/${register ? 'register' : 'login'}`, { method: 'POST', body }),
      );
      navigate('/chat');
    } catch (e) {
      setError(
        e.message === 'Failed to fetch'
          ? 'Cannot reach the server. Check your connection and API configuration.'
          : e.message,
      );
    } finally {
      setBusy(false);
    }
  }
  return (
    <main className="auth-page">
      <section className="auth-story">
        <Logo />
        <div className="story-content">
          <span className="eyebrow light">
            <Sparkles size={15} /> GOOD CONVERSATIONS START HERE
          </span>
          <h1>
            A little closer.
            <br />
            Wherever you are.
          </h1>
          <p>
            Big ideas, little updates, and everything in between. Give your conversations a place to
            call home.
          </p>
          <div className="story-bubbles">
            <div className="sample-bubble">
              Got a minute for a good idea? <span>10:24</span>
            </div>
            <div className="sample-bubble reply">
              Always. Let's hear it! <CheckCheck size={16} />
            </div>
            <div className="bubble-typing">
              <i />
              <i />
              <i />
            </div>
          </div>
        </div>
        <div className="story-footer">
          <ShieldCheck size={18} /> Your people. Your space. Your conversations.
        </div>
      </section>
      <section className="auth-form">
        <div className="mobile-brand">
          <Logo />
        </div>
        <div className="form-wrap">
          <span className="eyebrow">YOUR NEXT CONVERSATION AWAITS</span>
          <h2>{register ? 'Make yourself at home.' : 'Welcome back.'}</h2>
          <p className="muted">
            {register
              ? 'Create your account and bring your people together.'
              : 'Sign in to pick up where you left off.'}
          </p>
          <form onSubmit={submit}>
            {register && (
              <label>
                Your name
                <input
                  name="name"
                  autoComplete="name"
                  placeholder="e.g. Alex Morgan"
                  required
                  minLength={2}
                  maxLength={60}
                />
              </label>
            )}
            <label>
              Email address
              <input
                type="email"
                name="email"
                autoComplete="email"
                placeholder="you@example.com"
                required
                maxLength={254}
              />
            </label>
            <label>
              Password
              <input
                type="password"
                name="password"
                autoComplete={register ? 'new-password' : 'current-password'}
                placeholder={register ? 'At least 8 characters' : 'Enter your password'}
                required
                minLength={8}
                maxLength={128}
              />
            </label>
            {(error || auth.authError) && (
              <div className="error" role="alert">
                <AlertCircle size={17} />
                {error || auth.authError}
              </div>
            )}
            <button className="primary auth-submit" disabled={busy}>
              {busy ? <Spinner /> : register ? 'Create account' : 'Sign in'}
            </button>
          </form>
          <p className="switch-auth">
            {register ? 'Already part of the conversation?' : 'New around here?'}{' '}
            <Link to={register ? '/login' : '/register'} onClick={() => setError('')}>
              {register ? 'Sign in' : 'Create an account'}
            </Link>
          </p>
          <div className="auth-note">
            <MessageSquare size={17} /> Made for meaningful connections.
          </div>
        </div>
      </section>
    </main>
  );
}
function PeopleDialog({ mode, conversation, onClose, onDone, api, user }) {
  const [query, setQuery] = useState('');
  const [results, setResults] = useState([]);
  const [selected, setSelected] = useState([]);
  const [name, setName] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const [searching, setSearching] = useState(false);
  const closeRef = useRef(null);
  useEffect(() => {
    closeRef.current?.focus();
    const esc = (e) => {
      if (e.key === 'Escape') onClose();
    };
    document.addEventListener('keydown', esc);
    return () => document.removeEventListener('keydown', esc);
  }, [onClose]);
  useEffect(() => {
    const controller = new AbortController();
    setResults([]);
    if (!query.trim()) {
      setSearching(false);
      return;
    }
    setSearching(true);
    const timer = setTimeout(
      () =>
        api(`/users?q=${encodeURIComponent(query.trim())}`, { signal: controller.signal })
          .then(setResults)
          .catch((e) => {
            if (e.name !== 'AbortError') setError(e.message);
          })
          .finally(() => {
            if (!controller.signal.aborted) setSearching(false);
          }),
      250,
    );
    return () => {
      clearTimeout(timer);
      controller.abort();
    };
  }, [query, api]);
  async function choose(person) {
    if (mode === 'group') {
      setSelected((prev) =>
        prev.some((p) => p._id === person._id)
          ? prev.filter((p) => p._id !== person._id)
          : [...prev, person],
      );
      return;
    }
    setBusy(true);
    setError('');
    try {
      const c = await api(
        mode === 'add' ? `/conversations/${conversation._id}/members` : '/conversations/direct',
        { method: 'POST', body: { userId: person._id } },
      );
      onDone(c);
      onClose();
    } catch (e) {
      setError(e.message);
    } finally {
      setBusy(false);
    }
  }
  async function create(event) {
    event.preventDefault();
    setBusy(true);
    setError('');
    try {
      onDone(
        await api('/conversations/group', {
          method: 'POST',
          body: { name, memberIds: selected.map((p) => p._id) },
        }),
      );
      onClose();
    } catch (e) {
      setError(e.message);
    } finally {
      setBusy(false);
    }
  }
  const visible = results.filter((p) => !conversation?.members.some((m) => m._id === p._id));
  return (
    <div
      className="modal-backdrop"
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <section
        className="modal"
        role="dialog"
        aria-modal="true"
        aria-label={
          mode === 'group' ? 'Create a group' : mode === 'add' ? 'Add people' : 'New conversation'
        }
        onKeyDown={(e) => {
          if (e.key === 'Tab') {
            const nodes = [...e.currentTarget.querySelectorAll('button:not(:disabled), input')];
            if (e.shiftKey && document.activeElement === nodes[0]) {
              e.preventDefault();
              nodes.at(-1)?.focus();
            } else if (!e.shiftKey && document.activeElement === nodes.at(-1)) {
              e.preventDefault();
              nodes[0]?.focus();
            }
          }
        }}
      >
        <header>
          <div className="modal-icon">{mode === 'group' ? <Users /> : <UserPlus />}</div>
          <button
            ref={closeRef}
            className="icon-button"
            aria-label="Close dialog"
            onClick={onClose}
          >
            <X />
          </button>
        </header>
        <h2>
          {mode === 'group'
            ? 'Better, together.'
            : mode === 'add'
              ? 'Make room for more.'
              : 'Start something good.'}
        </h2>
        <p className="muted">
          {mode === 'group'
            ? 'Give your group a name and invite at least two people.'
            : 'Find someone by name or email.'}
        </p>
        {mode === 'group' && (
          <label>
            Group name
            <input
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="e.g. The creative corner"
              minLength={2}
              maxLength={80}
            />
          </label>
        )}
        <div className="search-field">
          <Search size={18} />
          <input
            autoFocus
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search people…"
            aria-label="Search people"
            maxLength={80}
          />
          {searching && <Spinner />}
        </div>
        {selected.length > 0 && (
          <div className="chips">
            {selected.map((p) => (
              <button key={p._id} onClick={() => choose(p)}>
                {p.name}
                <X size={13} />
              </button>
            ))}
          </div>
        )}
        <div className="people-results">
          {visible.map((p) => (
            <button key={p._id} disabled={busy} onClick={() => choose(p)} className="person-result">
              <Avatar name={p.name} />
              <div>
                <strong>{p.name}</strong>
                <small>{p.email}</small>
              </div>
              {selected.some((s) => s._id === p._id) ? <Check size={20} /> : <Plus size={18} />}
            </button>
          ))}
          {!searching && !visible.length && (
            <p className="search-hint">
              {query
                ? 'No people found. Try a different name or email.'
                : 'A new conversation is just a search away.'}
            </p>
          )}
        </div>
        {error && (
          <p className="error" role="alert">
            {error}
          </p>
        )}
        {mode === 'group' && (
          <button
            className="primary full"
            disabled={busy || selected.length < 2 || name.trim().length < 2}
            onClick={create}
          >
            {busy ? (
              <Spinner />
            ) : (
              `Create group${selected.length ? ` · ${selected.length + 1} people` : ''}`
            )}
          </button>
        )}
      </section>
    </div>
  );
}
function ChatPage() {
  const { user, token, logout } = useContext(AuthContext);
  const api = useCallback((path, options = {}) => request(path, { ...options, token }), [token]);
  const [conversations, setConversations] = useState([]);
  const [activeId, setActiveId] = useState(null);
  const [messages, setMessages] = useState([]);
  const [cursor, setCursor] = useState(null);
  const [text, setText] = useState('');
  const [file, setFile] = useState(null);
  const [preview, setPreview] = useState(null);
  const [sending, setSending] = useState(false);
  const [loading, setLoading] = useState(true);
  const [loadingMessages, setLoadingMessages] = useState(false);
  const [olderBusy, setOlderBusy] = useState(false);
  const [error, setError] = useState('');
  const [dialog, setDialog] = useState(null);
  const [details, setDetails] = useState(false);
  const [search, setSearch] = useState('');
  const [filter, setFilter] = useState('all');
  const [online, setOnline] = useState([]);
  const [connected, setConnected] = useState(false);
  const [typers, setTypers] = useState({});
  const socketRef = useRef(null);
  const activeRef = useRef(null);
  const messagesRef = useRef([]);
  const syncedSeq = useRef({});
  const scrollRef = useRef(null);
  const shouldScroll = useRef(true);
  const typingTimer = useRef(null);
  const lastTyping = useRef(0);
  const retryId = useRef(null);
  const seenSeq = useRef({});
  const listRequest = useRef(0);
  const refreshTimer = useRef(null);
  const pendingReads = useRef({});
  const active = conversations.find((c) => c._id === activeId);
  activeRef.current = activeId;
  messagesRef.current = messages;
  const refresh = useCallback(async () => {
    const version = ++listRequest.current;
    const list = await api('/conversations');
    if (version === listRequest.current) setConversations(list);
    return list;
  }, [api]);
  const scheduleRefresh = useCallback(() => {
    if (refreshTimer.current) return;
    refreshTimer.current = setTimeout(() => {
      refreshTimer.current = null;
      refresh().catch((e) => setError(e.message));
    }, 120);
  }, [refresh]);
  const catchUp = useCallback(
    async (cid) => {
      // Fetch forward from the last contiguous loaded point, including long disconnects.
      let after = syncedSeq.current[cid] || 0;
      for (;;) {
        const data = await api(`/conversations/${cid}/messages?after=${after}&limit=100`);
        if (activeRef.current !== cid) return;
        setMessages((prev) => mergeMessages(prev, data.messages));
        if (data.messages.length) {
          after = data.messages.at(-1).seq;
          syncedSeq.current[cid] = Math.max(syncedSeq.current[cid] || 0, after);
        }
        if (data.nextCursor === null) return after;
      }
    },
    [api],
  );
  const read = useCallback(
    (cid, seq) => {
      if (!seq || document.visibilityState === 'hidden' || (seenSeq.current[cid] || 0) >= seq)
        return;
      if (pendingReads.current[cid]) {
        pendingReads.current[cid].seq = Math.max(pendingReads.current[cid].seq, seq);
        return;
      }
      const entry = { seq };
      entry.timer = setTimeout(async () => {
        delete pendingReads.current[cid];
        if (activeRef.current !== cid || document.visibilityState === 'hidden') return;
        seenSeq.current[cid] = entry.seq;
        try {
          await api(`/conversations/${cid}/read`, { method: 'POST', body: { seq: entry.seq } });
          scheduleRefresh();
        } catch (e) {
          if ((seenSeq.current[cid] || 0) <= entry.seq) delete seenSeq.current[cid];
          setError(e.message);
        }
      }, 120);
      pendingReads.current[cid] = entry;
    },
    [api, scheduleRefresh],
  );
  useEffect(() => {
    let live = true;
    refresh()
      .catch((e) => {
        if (live) setError(e.message);
      })
      .finally(() => {
        if (live) setLoading(false);
      });
    const socket = io(API_URL, { auth: { token }, reconnection: true });
    socketRef.current = socket;
    socket.on('connect', () => setConnected(true));
    socket.on('disconnect', () => setConnected(false));
    socket.on('connect_error', (e) => {
      setConnected(false);
      if (e.message === 'Unauthorized') window.dispatchEvent(new Event('session-expired'));
    });
    socket.on('presence', setOnline);
    socket.on('session:ready', async () => {
      try {
        await refresh();
        const cid = activeRef.current;
        if (cid) {
          const seq = await catchUp(cid);
          if (activeRef.current === cid) read(cid, seq);
        }
      } catch (e) {
        setError(e.message);
      }
    });
    socket.on('conversation:updated', scheduleRefresh);
    socket.on('message:new', (message) => {
      if (message.conversation === activeRef.current) {
        if (message.seq === (syncedSeq.current[message.conversation] || 0) + 1)
          syncedSeq.current[message.conversation] = message.seq;
        const element = scrollRef.current;
        shouldScroll.current =
          !element ||
          element.scrollHeight - element.scrollTop - element.clientHeight < 160 ||
          message.sender._id === user._id;
        setMessages((prev) => mergeMessages(prev, [message]));
        read(message.conversation, message.seq);
      }
      scheduleRefresh();
    });
    socket.on('conversation:read', scheduleRefresh);
    socket.on('typing', (event) =>
      setTypers((prev) => ({
        ...prev,
        [`${event.conversationId}:${event.userId}`]: { ...event, expires: Date.now() + 3200 },
      })),
    );
    const timer = setInterval(
      () =>
        setTypers((prev) => {
          const valid = Object.entries(prev).filter(([, v]) => v.active && v.expires > Date.now());
          return valid.length === Object.keys(prev).length ? prev : Object.fromEntries(valid);
        }),
      1000,
    );
    const onVisible = async () => {
      if (document.visibilityState === 'visible') {
        const cid = activeRef.current;
        try {
          await refresh();
          if (cid) {
            const seq = await catchUp(cid);
            if (activeRef.current === cid) read(cid, seq);
          }
        } catch (e) {
          setError(e.message);
        }
      }
    };
    document.addEventListener('visibilitychange', onVisible);
    return () => {
      live = false;
      clearInterval(timer);
      clearTimeout(typingTimer.current);
      clearTimeout(refreshTimer.current);
      refreshTimer.current = null;
      for (const pending of Object.values(pendingReads.current)) clearTimeout(pending.timer);
      pendingReads.current = {};
      socket.disconnect();
      document.removeEventListener('visibilitychange', onVisible);
    };
  }, [api, refresh, scheduleRefresh, read, catchUp, token, user._id]);
  useEffect(() => {
    if (!activeId) {
      setMessages([]);
      return;
    }
    const cid = activeId;
    const controller = new AbortController();
    setMessages([]);
    setCursor(null);
    setLoadingMessages(true);
    setText('');
    setFile(null);
    setError('');
    retryId.current = null;
    shouldScroll.current = true;
    socketRef.current?.emit('conversation:join', { conversationId: cid });
    api(`/conversations/${cid}/messages`, { signal: controller.signal })
      .then((data) => {
        syncedSeq.current[cid] = data.messages.at(-1)?.seq || 0;
        setMessages((prev) => mergeMessages(data.messages, prev));
        setCursor(data.nextCursor);
        read(cid, data.messages.at(-1)?.seq);
      })
      .catch((e) => {
        if (e.name !== 'AbortError') setError(e.message);
      })
      .finally(() => {
        if (!controller.signal.aborted) setLoadingMessages(false);
      });
    return () => {
      controller.abort();
      socketRef.current?.emit('typing', { conversationId: cid, active: false });
    };
  }, [activeId, api, read]);
  useEffect(() => {
    if (shouldScroll.current && scrollRef.current)
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
  }, [messages, loadingMessages]);
  useEffect(() => {
    if (!file) {
      setPreview(null);
      return;
    }
    const url = URL.createObjectURL(file);
    setPreview(url);
    return () => URL.revokeObjectURL(url);
  }, [file]);
  async function loadOlder() {
    const cid = activeId;
    setOlderBusy(true);
    const el = scrollRef.current;
    const height = el?.scrollHeight || 0;
    try {
      const data = await api(`/conversations/${cid}/messages?before=${cursor}`);
      if (activeRef.current !== cid) return;
      shouldScroll.current = false;
      setMessages((prev) => mergeMessages(data.messages, prev));
      setCursor(data.nextCursor);
      requestAnimationFrame(() => {
        if (el) el.scrollTop += el.scrollHeight - height;
      });
    } catch (e) {
      setError(e.message);
    } finally {
      setOlderBusy(false);
    }
  }
  function changeText(value) {
    setText(value);
    retryId.current = null;
    const cid = activeId;
    if (!value || !text || Date.now() - lastTyping.current > 1400) {
      socketRef.current?.emit('typing', { conversationId: cid, active: !!value });
      lastTyping.current = Date.now();
    }
    clearTimeout(typingTimer.current);
    typingTimer.current = setTimeout(
      () => socketRef.current?.emit('typing', { conversationId: cid, active: false }),
      1800,
    );
  }
  async function send(event) {
    event?.preventDefault();
    if (sending || (!text.trim() && !file)) return;
    const cid = activeId;
    const draft = text;
    const image = file;
    const clientId = retryId.current || crypto.randomUUID();
    retryId.current = clientId;
    setSending(true);
    setError('');
    try {
      let body = { text: draft.trim(), clientId };
      let path = 'messages';
      if (image) {
        body = new FormData();
        body.append('text', draft.trim());
        body.append('clientId', clientId);
        body.append('image', image);
        path = 'images';
      }
      const message = await api(`/conversations/${cid}/${path}`, { method: 'POST', body });
      if (activeRef.current === cid) {
        shouldScroll.current = true;
        setMessages((prev) => mergeMessages(prev, [message]));
        setText('');
        setFile(null);
        retryId.current = null;
        await read(cid, message.seq);
      }
      socketRef.current?.emit('typing', { conversationId: cid, active: false });
      await refresh();
    } catch (e) {
      setError(
        e.message === 'Failed to fetch'
          ? 'Message could not be confirmed. Try Send again to safely retry.'
          : e.message,
      );
    } finally {
      setSending(false);
    }
  }
  function pickFile(event) {
    const image = event.target.files?.[0];
    event.target.value = '';
    if (!image) return;
    if (
      image.size > 5 * 1024 * 1024 ||
      !['image/jpeg', 'image/png', 'image/webp', 'image/gif'].includes(image.type)
    ) {
      setError('Choose a JPEG, PNG, WebP or GIF image up to 5 MB.');
      return;
    }
    setFile(image);
    retryId.current = null;
  }
  const title = active ? conversationName(active, user._id) : '';
  const peer = active?.members.find((m) => m._id !== user._id);
  const activeOnline = active?.kind === 'direct' && online.includes(peer?._id);
  const typing = Object.values(typers).filter(
    (t) => t.conversationId === activeId && t.active && t.expires > Date.now(),
  );
  const list = conversations.filter(
    (c) =>
      conversationName(c, user._id).toLowerCase().includes(search.toLowerCase()) &&
      (filter === 'all' || (filter === 'unread' ? c.unreadCount > 0 : c.kind === 'group')),
  );
  const unread = conversations.reduce((n, c) => n + c.unreadCount, 0);
  const onDialogDone = (c) => {
    refresh().catch((e) => setError(e.message));
    setActiveId(c._id);
  };
  const closeDialog = useCallback(() => setDialog(null), []);
  return (
    <div className={`app-shell ${activeId ? 'has-active' : ''}`}>
      <nav className="rail" aria-label="Account navigation">
        <div className="rail-mark">
          <MessageSquare size={24} fill="currentColor" />
        </div>
        <button
          className="rail-button selected"
          aria-label="Messages"
          onClick={() => setActiveId(null)}
        >
          <MessagesSquare size={24} />
          {unread > 0 && <i />}
        </button>
        <button
          className="rail-button"
          aria-label="Create group"
          onClick={() => setDialog('group')}
        >
          <Users size={23} />
        </button>
        <div className="rail-bottom">
          <Avatar small name={user.name} />
          <button className="rail-button" onClick={logout} title="Sign out" aria-label="Sign out">
            <LogOut size={20} />
          </button>
        </div>
      </nav>
      <aside className="sidebar">
        <div className="workspace-title">
          <div>
            <strong>orphchat</strong>
            <span>YOUR EVERYDAY CONNECTION</span>
          </div>
          <span className="workspace-badge">CHAT</span>
        </div>
        <div className="sidebar-heading">
          <h1>
            Messages <span>{conversations.length}</span>
          </h1>
          <button
            className="new-chat"
            aria-label="New conversation"
            onClick={() => setDialog('direct')}
          >
            <Plus size={21} />
          </button>
        </div>
        <div className="search-field sidebar-search">
          <Search size={18} />
          <input
            placeholder="Search conversations"
            aria-label="Search conversations"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
        </div>
        <div className="filters" aria-label="Conversation filters">
          {[
            ['all', 'All messages'],
            ['unread', 'Unread'],
            ['group', 'Groups'],
          ].map(([key, label]) => (
            <button
              key={key}
              className={filter === key ? 'active' : ''}
              onClick={() => setFilter(key)}
            >
              {label}
              {key === 'unread' && unread > 0 && <span>{unread}</span>}
            </button>
          ))}
        </div>
        <div className="conversation-list">
          {loading && (
            <div className="list-placeholder">
              <Spinner /> Loading your conversations…
            </div>
          )}
          {!loading && !list.length && (
            <div className="list-placeholder">
              <MessageSquare size={26} />
              <strong>
                {search || filter !== 'all'
                  ? 'Nothing here just yet'
                  : 'Your people are one hello away'}
              </strong>
              <p>{search ? 'Try another name.' : 'Start a chat or bring everyone into a group.'}</p>
              {!search && (
                <button className="text-button" onClick={() => setDialog('direct')}>
                  Find your people
                </button>
              )}
            </div>
          )}
          {list.map((c) => {
            const name = conversationName(c, user._id);
            const other = c.members.find((m) => m._id !== user._id);
            return (
              <button
                key={c._id}
                onClick={() => {
                  setActiveId(c._id);
                  setDetails(false);
                }}
                className={`conversation-row ${activeId === c._id ? 'active' : ''}`}
              >
                <Avatar
                  name={name}
                  group={c.kind === 'group'}
                  online={c.kind === 'direct' && online.includes(other?._id)}
                />
                <div className="conversation-copy">
                  <div>
                    <strong>{name}</strong>
                    <time>
                      {c.lastMessage?.createdAt
                        ? new Date(c.lastMessage.createdAt).toLocaleTimeString([], {
                            hour: '2-digit',
                            minute: '2-digit',
                          })
                        : ''}
                    </time>
                  </div>
                  <div>
                    <p>
                      {c.lastMessage
                        ? `${c.lastMessage.sender === user._id ? 'You: ' : ''}${c.lastMessage.image ? '▧ Image' : c.lastMessage.text}`
                        : 'Say hello. Make their day.'}
                    </p>
                    {c.unreadCount > 0 && (
                      <span className="unread-badge">
                        {c.unreadCount > 99 ? '99+' : c.unreadCount}
                      </span>
                    )}
                  </div>
                </div>
              </button>
            );
          })}
        </div>
        <button className="group-card" onClick={() => setDialog('group')}>
          <span>
            <Users size={21} />
          </span>
          <div>
            <strong>Good things happen together.</strong>
            <small>Create a group for your people</small>
          </div>
          <Plus size={18} />
        </button>
        <div className="sidebar-user">
          <Avatar small name={user.name} />
          <div>
            <strong>{user.name}</strong>
            <small>
              <i className={connected ? 'status-dot' : 'status-dot offline'} />
              {connected ? 'Connected' : 'Reconnecting…'}
            </small>
          </div>
          <button className="icon-button mobile-logout" onClick={logout} aria-label="Sign out">
            <LogOut size={18} />
          </button>
        </div>
      </aside>
      <main className="chat-main">
        {!active ? (
          <div className="welcome-screen">
            <div className="welcome-orbit">
              <span className="orbit-bubble one">
                <MessageSquare size={24} />
              </span>
              <span className="orbit-bubble two">
                <Smile size={25} />
              </span>
              <div className="welcome-icon">
                <MessagesSquare size={49} strokeWidth={1.5} />
              </div>
              <span className="orbit-bubble three">
                <Sparkles size={21} />
              </span>
            </div>
            <span className="eyebrow">LESS DISTANCE. MORE CONNECTION.</span>
            <h2>
              Every great conversation
              <br />
              starts with a hello.
            </h2>
            <p>
              Catch up with a friend. Bring your team together.
              <br />
              Your next conversation is waiting.
            </p>
            <button className="primary" onClick={() => setDialog('direct')}>
              <Plus size={18} /> Start a conversation
            </button>
            <div className="welcome-features">
              <span>
                <MessageSquare size={16} /> Instant messages
              </span>
              <span>
                <Users size={16} /> Shared spaces
              </span>
              <span>
                <ImagePlus size={16} /> Little moments
              </span>
            </div>
          </div>
        ) : (
          <>
            <header className="chat-header">
              <button
                className="icon-button back-button"
                aria-label="Back to conversations"
                onClick={() => setActiveId(null)}
              >
                <ChevronLeft />
              </button>
              <Avatar name={title} group={active.kind === 'group'} online={activeOnline} />
              <div className="chat-heading">
                <h2>{title}</h2>
                <p>
                  {active.kind === 'group'
                    ? `${active.members.length} people · A space for everyone`
                    : activeOnline
                      ? 'Online · Here for the conversation'
                      : 'Offline · Messages will be waiting'}
                </p>
              </div>
              <button
                className={`icon-button ${details ? 'pressed' : ''}`}
                aria-label="Conversation details"
                onClick={() => setDetails(!details)}
              >
                <Info size={21} />
              </button>
            </header>
            {details && (
              <section className="details-panel">
                <div>
                  <strong>
                    {active.kind === 'group' ? 'Group members' : 'Conversation members'}
                  </strong>
                  <p>
                    {active.members
                      .map(
                        (m) =>
                          `${m.name}${m._id === active.admin ? ' (admin)' : ''}${m._id === user._id ? ' (you)' : ''}`,
                      )
                      .join(', ')}
                  </p>
                </div>
                {active.kind === 'group' && active.admin === user._id && (
                  <button className="secondary" onClick={() => setDialog('add')}>
                    <UserPlus size={16} /> Add people
                  </button>
                )}
              </section>
            )}
            <div className="message-scroll" ref={scrollRef}>
              {loadingMessages ? (
                <div className="messages-loading">
                  <Spinner /> Finding where you left off…
                </div>
              ) : (
                <>
                  {cursor && (
                    <button className="load-older" onClick={loadOlder} disabled={olderBusy}>
                      {olderBusy ? <Spinner /> : 'Load earlier messages'}
                    </button>
                  )}
                  <div className="conversation-start">
                    <span>
                      <MessageSquare size={19} />
                    </span>
                    <strong>This is your space with {title}.</strong>
                    <small>A new conversation. A little possibility.</small>
                  </div>
                  {messages.map((m, index) => {
                    const own = m.sender._id === user._id;
                    const previous = messages[index - 1];
                    const day = new Date(m.createdAt).toLocaleDateString([], {
                      month: 'long',
                      day: 'numeric',
                      year: 'numeric',
                    });
                    const showDay =
                      !previous ||
                      new Date(previous.createdAt).toDateString() !==
                        new Date(m.createdAt).toDateString();
                    const readByOther = active.members.some(
                      (p) => p._id !== user._id && (active.readSeq?.[p._id] || 0) >= m.seq,
                    );
                    return (
                      <React.Fragment key={m._id}>
                        {showDay && (
                          <div className="date-divider">
                            <span>{day}</span>
                          </div>
                        )}
                        <article className={`message-row ${own ? 'own' : ''}`}>
                          {!own && <Avatar small name={m.sender.name} />}
                          <div className="message-content">
                            {!own && active.kind === 'group' && (
                              <strong className="sender-name">{m.sender.name}</strong>
                            )}
                            <div className="message-bubble">
                              {m.image?.url && (
                                <a href={m.image.url} target="_blank" rel="noreferrer">
                                  <img
                                    src={m.image.url}
                                    alt={m.text || `Image shared by ${m.sender.name}`}
                                    loading="lazy"
                                    onLoad={() => {
                                      if (shouldScroll.current && scrollRef.current)
                                        scrollRef.current.scrollTop =
                                          scrollRef.current.scrollHeight;
                                    }}
                                  />
                                </a>
                              )}
                              {m.text && <p>{m.text}</p>}
                            </div>
                            <div className="message-meta">
                              <time>
                                {new Date(m.createdAt).toLocaleTimeString([], {
                                  hour: '2-digit',
                                  minute: '2-digit',
                                })}
                              </time>
                              {own && (
                                <span
                                  className={readByOther ? 'read-check' : ''}
                                  title={readByOther ? 'Read' : 'Sent'}
                                >
                                  {readByOther ? <CheckCheck size={15} /> : <Check size={15} />}
                                </span>
                              )}
                            </div>
                          </div>
                        </article>
                      </React.Fragment>
                    );
                  })}
                </>
              )}
            </div>
            <div className="typing-line" aria-live="polite">
              {typing.length > 0 && (
                <>
                  <span className="typing-dots">
                    <i />
                    <i />
                    <i />
                  </span>
                  {typing.map((t) => t.name).join(', ')} {typing.length > 1 ? 'are' : 'is'} typing…
                </>
              )}
            </div>
            <footer className="composer-area">
              {preview && file && (
                <div className="attachment-preview">
                  <img src={preview} alt="Image ready to send" />
                  <span>{file.name}</span>
                  <button
                    className="icon-button"
                    aria-label="Remove image"
                    onClick={() => {
                      setFile(null);
                      retryId.current = null;
                    }}
                  >
                    <X size={16} />
                  </button>
                </div>
              )}
              <form className="composer" onSubmit={send}>
                <label
                  className={`icon-button attach-button ${sending ? 'disabled' : ''}`}
                  title="Share an image"
                >
                  <ImagePlus size={22} />
                  <input
                    type="file"
                    aria-label="Share an image"
                    accept="image/jpeg,image/png,image/webp,image/gif"
                    onChange={pickFile}
                    disabled={sending}
                  />
                </label>
                <textarea
                  aria-label="Message"
                  placeholder={`Message ${title}…`}
                  value={text}
                  disabled={sending}
                  onChange={(e) => changeText(e.target.value)}
                  maxLength={4000}
                  rows={1}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter' && !e.shiftKey && !e.nativeEvent.isComposing) {
                      e.preventDefault();
                      send();
                    }
                  }}
                />
                <button
                  className="send-button"
                  aria-label="Send message"
                  disabled={sending || (!text.trim() && !file)}
                >
                  {sending ? <Spinner /> : <Send size={20} />}
                </button>
              </form>
              <div className="composer-hint">
                <span>Enter to send · Shift + Enter for a new line</span>
                <span>
                  {text.length ? `${text.length}/4000` : 'A little hello goes a long way.'}
                </span>
              </div>
            </footer>
          </>
        )}
        {error && (
          <div className="toast" role="alert">
            <AlertCircle size={18} />
            <span>{error}</span>
            <button
              className="text-button"
              onClick={() => {
                setError('');
                refresh().catch((e) => setError(e.message));
              }}
            >
              Retry
            </button>
            <button className="icon-button" aria-label="Dismiss error" onClick={() => setError('')}>
              <X size={16} />
            </button>
          </div>
        )}
      </main>
      {dialog && (
        <PeopleDialog
          mode={dialog}
          conversation={dialog === 'add' ? active : null}
          onClose={closeDialog}
          onDone={onDialogDone}
          api={api}
          user={user}
        />
      )}
    </div>
  );
}
function Protected() {
  const auth = useContext(AuthContext);
  return auth.checking ? (
    <div className="app-loading">
      <Spinner /> Opening your space…
    </div>
  ) : auth.token ? (
    <ChatPage />
  ) : (
    <Navigate to="/login" replace />
  );
}
export function App() {
  return (
    <BrowserRouter>
      <AuthProvider>
        <Routes>
          <Route path="/login" element={<AuthPage />} />
          <Route path="/register" element={<AuthPage register />} />
          <Route path="/chat" element={<Protected />} />
          <Route path="*" element={<Navigate to="/chat" replace />} />
        </Routes>
      </AuthProvider>
    </BrowserRouter>
  );
}
if (document.getElementById('root')) createRoot(document.getElementById('root')).render(<App />);
