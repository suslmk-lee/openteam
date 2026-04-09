import { describe, it, expect } from 'vitest';

describe('Example Unit Tests', () => {
  it('should perform basic arithmetic', () => {
    expect(1 + 1).toBe(2);
  });

  it('should work with strings', () => {
    const message = 'Hello, World!';
    expect(message).toContain('World');
  });

  it('should work with arrays', () => {
    const numbers = [1, 2, 3, 4, 5];
    expect(numbers).toHaveLength(5);
    expect(numbers).toContain(3);
  });

  it('should work with objects', () => {
    const user = {
      id: 1,
      name: 'John',
      email: 'john@example.com',
    };
    expect(user).toEqual({
      id: 1,
      name: 'John',
      email: 'john@example.com',
    });
  });
});
