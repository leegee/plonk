import BufferLoader from './BufferLoader';

window.AudioContext = jest.fn().mockImplementation(() => {
  return {}
});

test('BufferLoader', () => {
  const actx = new AudioContext();
  const b = new BufferLoader(actx);
  expect(b).toBeInstanceOf(BufferLoader);

  const loadStatus = b.load();
  expect(loadStatus).toBeInstanceOf(Promise);
});

