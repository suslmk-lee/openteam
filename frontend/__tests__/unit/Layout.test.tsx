import { describe, it, expect } from 'vitest';
import { render, screen } from '../setup/test-utils';
import Layout from '../../src/components/Layout';

describe('Layout Component', () => {
  it('should render without crashing', () => {
    render(<Layout />);
    expect(screen.getByRole('navigation')).toBeInTheDocument();
  });

  it('should display navigation menu', () => {
    render(<Layout />);
    const nav = screen.getByRole('navigation');
    expect(nav).toBeInTheDocument();
  });
});
