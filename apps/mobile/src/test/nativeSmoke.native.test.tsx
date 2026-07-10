import { Text } from 'react-native';
import { render, screen } from '@testing-library/react-native';
import { renderWithProviders } from './renderWithProviders';

describe('native test harness', () => {
  it('renders React Native accessibility semantics', () => {
    render(<Text accessibilityRole="header">测试</Text>);
    expect(screen.getByRole('header', { name: '测试' })).toBeTruthy();
  });

  it('renders children through the provider harness', () => {
    renderWithProviders(<Text>provider child</Text>);
    expect(screen.getByText('provider child')).toBeTruthy();
  });
});
