import React from 'react';
import { test, expect, vi, afterEach } from 'vitest';
import { render, screen, fireEvent, waitFor, cleanup } from '@testing-library/react';
import { App } from './main.jsx';
afterEach(() => {
  cleanup();
  sessionStorage.clear();
  vi.unstubAllGlobals();
});
test('protected chat redirects to login and surfaces rejected credentials', async () => {
  history.replaceState({}, '', '/chat');
  vi.stubGlobal(
    'fetch',
    vi
      .fn()
      .mockResolvedValue({
        ok: false,
        status: 401,
        json: async () => ({ error: 'Email or password is incorrect' }),
      }),
  );
  render(<App />);
  expect(await screen.findByText('Welcome back.')).toBeInTheDocument();
  fireEvent.change(screen.getByLabelText('Email address'), {
    target: { value: 'alice@example.com' },
  });
  fireEvent.change(screen.getByLabelText('Password'), { target: { value: 'wrong-password' } });
  fireEvent.click(screen.getByRole('button', { name: 'Sign in' }));
  await waitFor(() =>
    expect(screen.getByRole('alert')).toHaveTextContent('Email or password is incorrect'),
  );
  expect(sessionStorage.getItem('sapphire-session')).toBeNull();
});
