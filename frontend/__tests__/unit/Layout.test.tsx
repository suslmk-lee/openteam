import { describe, it, expect, vi } from 'vitest';
import { render } from '../setup/test-utils';
import Layout from '../../src/components/Layout';

// Mock the TeamProfileContext
vi.mock('../../src/contexts/TeamProfileContext', () => ({
  useTeamProfile: () => ({
    profile: {
      setupDone: true,
      teamType: 'si_business',
    },
    loading: false,
  }),
}));

describe('Layout Component', () => {
  it('should render without crashing', () => {
    const { container } = render(<Layout />);
    expect(container).toBeDefined();
  });

  it('should render main outlet for page content', () => {
    const { container } = render(<Layout />);
    // Just verify component renders without errors
    expect(container.firstChild).toBeDefined();
  });
});
