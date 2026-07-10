import { Text } from 'react-native';
import { render, screen } from '@testing-library/react-native';

describe('native test harness', () => {
  it('renders React Native accessibility semantics', () => {
    render(<Text accessibilityRole="header">测试</Text>);
    expect(screen.getByRole('header', { name: '测试' })).toBeTruthy();
  });
});
