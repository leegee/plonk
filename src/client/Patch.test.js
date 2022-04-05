import Patch from './Patch';

window.AudioContext = jest.fn().mockImplementation(() => {
  return {}
});

test('Load pluck', () => {
  const patch = new Patch({ uri: 'samples/pluck' });
  expect(patch).toBeInstanceOf(Patch);

  const loadStatus = patch.load();
  expect(loadStatus).toBeInstanceOf(Promise);
});

