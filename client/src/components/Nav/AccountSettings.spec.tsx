import { fireEvent, render, screen } from '@testing-library/react';
import { SystemRoles } from 'librechat-data-provider';
import AccountSettings from './AccountSettings';

const mockNavigate = jest.fn();
const mockUseAuthContext = jest.fn();
const mockUseGetStartupConfig = jest.fn();
const mockUseGetUserBalance = jest.fn();

jest.mock('react-router-dom', () => ({
  ...jest.requireActual('react-router-dom'),
  useNavigate: () => mockNavigate,
}));

jest.mock(
  '@librechat/client',
  () => ({
    Avatar: () => <div data-testid="avatar" />,
    DropdownMenuSeparator: () => <hr />,
    GearIcon: () => <span data-testid="gear-icon" />,
    LinkIcon: () => <span data-testid="link-icon" />,
  }),
  { virtual: true },
);

jest.mock('~/components/Chat/Input/Files/MyFilesModal', () => ({
  MyFilesModal: () => <div data-testid="files-modal" />,
}));

jest.mock('~/data-provider', () => ({
  useGetStartupConfig: () => mockUseGetStartupConfig(),
  useGetUserBalance: () => mockUseGetUserBalance(),
}));

jest.mock('~/hooks/AuthContext', () => ({
  useAuthContext: () => mockUseAuthContext(),
}));

jest.mock('~/hooks', () => ({
  useLocalize: () => (key: string) => key,
}));

jest.mock('./Settings', () => () => <div data-testid="settings" />);

describe('AccountSettings admin navigation', () => {
  beforeEach(() => {
    mockNavigate.mockReset();
    mockUseGetStartupConfig.mockReturnValue({ data: { helpAndFaqURL: '/' } });
    mockUseGetUserBalance.mockReturnValue({ data: null });
  });

  it('shows the admin center entry for administrators', () => {
    mockUseAuthContext.mockReturnValue({
      user: {
        role: SystemRoles.ADMIN,
        email: 'admin@example.com',
        name: 'Admin',
      },
      isAuthenticated: true,
      logout: jest.fn(),
    });

    render(<AccountSettings />);
    fireEvent.click(screen.getByTestId('nav-user'));
    fireEvent.click(screen.getByText('com_admin_title'));

    expect(mockNavigate).toHaveBeenCalledWith('/d/admin/accounts');
  });

  it('hides the admin center entry for regular users', () => {
    mockUseAuthContext.mockReturnValue({
      user: {
        role: SystemRoles.USER,
        email: 'user@example.com',
        name: 'User',
      },
      isAuthenticated: true,
      logout: jest.fn(),
    });

    render(<AccountSettings />);
    fireEvent.click(screen.getByTestId('nav-user'));

    expect(screen.queryByText('com_admin_title')).not.toBeInTheDocument();
  });
});
