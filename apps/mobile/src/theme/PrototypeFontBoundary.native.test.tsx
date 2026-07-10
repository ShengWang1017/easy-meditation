import { Text } from 'react-native';
import { render, screen } from '@testing-library/react-native';
import { jest } from '@jest/globals';
import { useFonts } from 'expo-font';
import { PrototypeFontBoundary } from './PrototypeFontBoundary';

jest.mock('expo-font', () => ({
  useFonts: jest.fn()
}));

const mockUseFonts = jest.mocked(useFonts);

describe('PrototypeFontBoundary', () => {
  beforeEach(() => {
    mockUseFonts.mockReset();
  });

  it('does not mount children until both registered fonts finish loading', () => {
    const childRender = jest.fn();
    const Child = () => {
      childRender();
      return <Text>routed content</Text>;
    };

    mockUseFonts.mockReturnValue([false, null]);

    const view = render(
      <PrototypeFontBoundary>
        <Child />
      </PrototypeFontBoundary>
    );

    expect(childRender).not.toHaveBeenCalled();
    expect(screen.queryByText('routed content')).toBeNull();
    expect(Object.keys(mockUseFonts.mock.calls[0]?.[0] ?? {})).toEqual([
      'LXGWWenKai-Medium',
      'LXGWWenKai-Regular'
    ]);

    mockUseFonts.mockReturnValue([true, null]);
    view.rerender(
      <PrototypeFontBoundary>
        <Child />
      </PrototypeFontBoundary>
    );

    expect(childRender).toHaveBeenCalledTimes(1);
    expect(screen.getByText('routed content')).toBeTruthy();
  });

  it('renders an accessible blocking error instead of falling back', () => {
    const childRender = jest.fn();
    const Child = () => {
      childRender();
      return <Text>routed content</Text>;
    };

    mockUseFonts.mockReturnValue([false, new Error('invalid font data')]);

    render(
      <PrototypeFontBoundary>
        <Child />
      </PrototypeFontBoundary>
    );

    expect(childRender).not.toHaveBeenCalled();
    expect(screen.queryByText('routed content')).toBeNull();
    expect(screen.getByRole('alert')).toBeTruthy();
    expect(screen.getByText('字体加载失败')).toBeTruthy();
    expect(screen.getByText(/应用无法加载所需字体/)).toBeTruthy();
  });
});
