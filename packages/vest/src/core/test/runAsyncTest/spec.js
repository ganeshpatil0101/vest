import _ from 'lodash';
import resetState from '../../../../testUtils/resetState';
import runRegisterSuite from '../../../../testUtils/runRegisterSuite';
import { OPERATION_MODE_STATEFUL } from '../../../constants';
import context from '../../context';
import state from '../../state';
import { KEY_CANCELED } from '../../state/constants';
import * as suiteState from '../../suite/suiteState';
import VestTest from '../lib/VestTest';
import { setPending } from '../lib/pending';
import runAsyncTest from '.';

const STATEMENT = 'some statement string';

const CASE_PASSING = 'passing';
const CASE_FAILING = 'failing';

const suiteId = 'suiteId_1';

describe.each([CASE_PASSING /*, CASE_FAILING*/])(
  'runAsyncTest: %s',
  testCase => {
    let testObject, fieldName;

    const runRunAsyncTest = (...args) =>
      context.run(
        {
          name: suiteId,
          suiteId,
          operationMode: OPERATION_MODE_STATEFUL,
        },
        () => runAsyncTest(...args)
      );

    beforeAll(() => {
      resetState();
    });

    beforeEach(() => {
      fieldName = 'field_1';

      runRegisterSuite({ name: suiteId });
      suiteState.patch(suiteId, state => ({
        ...state,
        fieldCallbacks: {
          ...state.fieldCallbacks,
          [fieldName]: state.fieldCallbacks[fieldName] || [],
        },
      }));
      testObject = new VestTest({
        fieldName,
        statement: STATEMENT,
        suiteId,
        testFn: () => null,
      });
      testObject.asyncTest =
        testCase === CASE_PASSING ? Promise.resolve() : Promise.reject();
      setPending(testObject);
    });

    describe('State updates', () => {
      test('Initial state matches snapshot (sanity)', () => {
        expect(suiteState.getCurrentState(suiteId).pending).toContain(
          testObject
        );
        expect(suiteState.getCurrentState(suiteId)).toMatchSnapshot();
        runRunAsyncTest(testObject);
      });

      it('Should remove test from pending array', () =>
        new Promise(done => {
          runRunAsyncTest(testObject);
          setTimeout(() => {
            expect(suiteState.getCurrentState(suiteId).pending).not.toContain(
              testObject
            );
            done();
          });
        }));

      describe('When test is canceled', () => {
        let currentState;
        beforeEach(() => {
          state.set(state => {
            state[KEY_CANCELED][testObject.id] = true;
            return state;
          });
          currentState = _.cloneDeep(suiteState.getCurrentState(suiteId));
        });

        it('Should remove test from pending array', () => {
          expect(suiteState.getCurrentState(suiteId).pending).toEqual(
            expect.arrayContaining([testObject])
          );
          runRunAsyncTest(testObject);
          return new Promise(done => {
            setTimeout(() => {
              expect(suiteState.getCurrentState(suiteId).pending).toEqual(
                expect.not.arrayContaining([testObject])
              );
              done();
            });
          });
        });

        it('Should remove test from canceled state', () => {
          expect(state.get()[KEY_CANCELED]).toHaveProperty(testObject.id);
          runRunAsyncTest(testObject);
          return new Promise(done => {
            setTimeout(() => {
              expect(state.get()[KEY_CANCELED]).not.toHaveProperty(
                testObject.id
              );
              done();
            });
          });
        });

        it('Should keep rest of the state unchanged', () =>
          new Promise(done => {
            runRunAsyncTest(testObject);
            setTimeout(() => {
              expect(
                _.omit(suiteState.getCurrentState(suiteId), 'pending')
              ).toEqual(_.omit(currentState, 'pending'));
              done();
            });
          }));
      });
    });

    describe('doneCallbacks', () => {
      let fieldCallback_1, fieldCallback_2, doneCallback;
      beforeEach(() => {
        fieldCallback_1 = jest.fn();
        fieldCallback_2 = jest.fn();
        doneCallback = jest.fn();
        suiteState.patch(suiteId, state => ({
          ...state,
          fieldCallbacks: {
            ...state.fieldCallbacks,
            [fieldName]: (state.fieldCallbacks[fieldName] || []).concat(
              fieldCallback_1,
              fieldCallback_2
            ),
          },
          doneCallbacks: state.doneCallbacks.concat(doneCallback),
        }));
      });
      describe('When no remaining tests', () => {
        it('Should run all callbacks', () =>
          new Promise(done => {
            expect(fieldCallback_1).not.toHaveBeenCalled();
            expect(fieldCallback_2).not.toHaveBeenCalled();
            expect(doneCallback).not.toHaveBeenCalled();
            runRunAsyncTest(testObject);
            setTimeout(() => {
              expect(fieldCallback_1).toHaveBeenCalled();
              expect(fieldCallback_2).toHaveBeenCalled();
              expect(doneCallback).toHaveBeenCalled();
              done();
            });
          }));
      });

      describe('When there are more tests left', () => {
        beforeEach(() => {
          setPending(
            new VestTest({
              fieldName: 'pending_field',
              statement: STATEMENT,
              suiteId,
              testFn: jest.fn(),
            })
          );
        });

        it("Should only run current field's callbacks", () =>
          new Promise(done => {
            expect(fieldCallback_1).not.toHaveBeenCalled();
            expect(fieldCallback_2).not.toHaveBeenCalled();
            expect(doneCallback).not.toHaveBeenCalled();
            runRunAsyncTest(testObject);
            setTimeout(() => {
              expect(fieldCallback_1).toHaveBeenCalled();
              expect(fieldCallback_2).toHaveBeenCalled();
              expect(doneCallback).not.toHaveBeenCalled();
              done();
            });
          }));
      });

      describe('When test is canceled', () => {
        beforeEach(() => {
          state.set(state => {
            state[KEY_CANCELED][testObject.id] = true;
            return state;
          });
        });

        it('Should return without running any callback', () =>
          new Promise(done => {
            expect(fieldCallback_1).not.toHaveBeenCalled();
            expect(fieldCallback_2).not.toHaveBeenCalled();
            expect(doneCallback).not.toHaveBeenCalled();
            runRunAsyncTest(testObject);
            setTimeout(() => {
              expect(fieldCallback_1).not.toHaveBeenCalled();
              expect(fieldCallback_2).not.toHaveBeenCalled();
              expect(doneCallback).not.toHaveBeenCalled();
              done();
            });
          }));
      });
    });

    describe('testObject', () => {
      let testObjectCopy;

      beforeEach(() => {
        testObject.fail = jest.fn();
        testObjectCopy = _.cloneDeep(testObject);
      });

      if (testCase === CASE_PASSING) {
        it('Should keep test object unchanged', () =>
          new Promise(done => {
            runRunAsyncTest(testObject);
            setTimeout(() => {
              expect(testObject).toEqual(testObjectCopy);
              done();
            });
          }));

        it('Should return without calling testObject.fail', () =>
          new Promise(done => {
            runRunAsyncTest(testObject);
            setTimeout(() => {
              expect(testObject.fail).not.toHaveBeenCalled();
              done();
            });
          }));
      }

      if (testCase === CASE_FAILING) {
        it('Should call testObject.fail', () =>
          new Promise(done => {
            runRunAsyncTest(testObject);
            setTimeout(() => {
              expect(testObject.fail).toHaveBeenCalled();
              done();
            });
          }));

        describe('When rejecting with a message', () => {
          const rejectionString = 'rejection string';
          beforeEach(() => {
            testObject.asyncTest.catch(Function.prototype);
            testObject.asyncTest = Promise.reject(rejectionString);
          });

          it('Should set test statement to rejection string', () =>
            new Promise(done => {
              runRunAsyncTest(testObject);
              setTimeout(() => {
                expect(testObject.statement).toBe(rejectionString);
                done();
              });
            }));
        });
      }
    });
  }
);
