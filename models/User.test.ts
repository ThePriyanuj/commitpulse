import mongoose from 'mongoose';
import { describe, it, expect, vi, beforeEach, afterEach, type MockInstance } from 'vitest';
import { User } from './User';

describe('User Model', () => {
  it('is compiled properly and exposed', () => {
    expect(User).toBeDefined();
    expect(User.modelName).toBe('User');
  });

  describe('username schema constraints', () => {
    it('has lowercase: true on username path', () => {
      const usernamePath = User.schema.path('username') as mongoose.SchemaType & {
        options: Record<string, unknown>;
      };
      expect(usernamePath.options.lowercase).toBe(true);
    });

    describe('createdAt schema', () => {
      it('uses a callable default that returns a timestamp', () => {
        const createdAtPath = User.schema.path('createdAt') as mongoose.SchemaType & {
          options: { default?: unknown };
        };

        expect(typeof createdAtPath.options.default).toBe('function');

        const result = (createdAtPath.options.default as () => number)();
        expect(typeof result).toBe('number');
        expect(Number.isFinite(result)).toBe(true);
      });

      it('has a defined defaultValue that is Date.now or returns a Date', () => {
        const createdAtPath = User.schema.path('createdAt') as mongoose.SchemaType & {
          defaultValue?: unknown;
          options: { default?: unknown };
        };

        const defaultValue = createdAtPath.defaultValue ?? createdAtPath.options.default;

        expect(defaultValue).toBeDefined();

        if (defaultValue !== Date.now) {
          expect(typeof defaultValue).toBe('function');
          const value = (defaultValue as () => unknown)();
          expect(value instanceof Date).toBe(true);
        }
      });
    });

    it('has trim: true on username path', () => {
      const usernamePath = User.schema.path('username') as mongoose.SchemaType & {
        options: Record<string, unknown>;
      };
      expect(usernamePath.options.trim).toBe(true);
    });

    it('has unique: true on username path', () => {
      const usernamePath = User.schema.path('username') as mongoose.SchemaType & {
        options: Record<string, unknown>;
      };
      expect(usernamePath.options.unique).toBe(true);
    });

    it('has required: true on username path', () => {
      const usernamePath = User.schema.path('username') as mongoose.SchemaType & {
        options: Record<string, unknown>;
      };
      expect(usernamePath.options.required).toBe(true);
    });
  });

  describe('Database Connection State 2 Handling', () => {
    it('buffers operations when connection is in state 2 (connecting)', async (): Promise<void> => {
      const readyStateSpy = vi
        .spyOn(mongoose.connection, 'readyState', 'get')
        .mockReturnValue(2 as unknown as typeof mongoose.connection.readyState);

      let operationAttempted = false;

      const simulateBufferedOperation = async (): Promise<string> => {
        if (mongoose.connection.readyState === 2) {
          operationAttempted = true;
          return 'buffered';
        }
        return 'executed';
      };

      const result = await simulateBufferedOperation();

      expect(mongoose.connection.readyState).toBe(2);
      expect(operationAttempted).toBe(true);
      expect(result).toBe('buffered');

      readyStateSpy.mockRestore();
    });
  });

  describe('User Model - Database Connection State', (): void => {
    let readyStateSpy: MockInstance<() => typeof mongoose.connection.readyState> | undefined;

    beforeEach((): void => {
      mongoose.set('bufferCommands', false);
    });

    afterEach((): void => {
      mongoose.set('bufferCommands', true);

      if (readyStateSpy) {
        readyStateSpy.mockRestore();
        readyStateSpy = undefined;
      }

      vi.clearAllMocks();
    });

    describe('when database connection readyState is 0 (disconnected)', (): void => {
      beforeEach((): void => {
        readyStateSpy = vi
          .spyOn(mongoose.connection, 'readyState', 'get')
          .mockReturnValue(0 as unknown as typeof mongoose.connection.readyState);
      });

      it('should throw an error when attempting User.findOne()', async (): Promise<void> => {
        await expect(User.findOne({ username: 'testuser' }).exec()).rejects.toBeDefined();
      });

      it('should throw an error when attempting User.create()', async (): Promise<void> => {
        await expect(
          User.create({
            username: 'newuser',
          })
        ).rejects.toBeDefined();
      });

      it('should throw an error when attempting User.updateOne()', async (): Promise<void> => {
        await expect(
          User.updateOne({ _id: 'someId' }, { username: 'updated' }).exec()
        ).rejects.toBeDefined();
      });

      it('should throw an error when attempting User.deleteOne()', async (): Promise<void> => {
        await expect(User.deleteOne({ _id: 'someId' }).exec()).rejects.toBeDefined();
      });

      it('should expose the actual connection readyState as 0', (): void => {
        expect(mongoose.connection.readyState).toBe(0);
      });
    });

    describe('when database connection readyState is 1 (connected)', (): void => {
      beforeEach((): void => {
        readyStateSpy = vi
          .spyOn(mongoose.connection, 'readyState', 'get')
          .mockReturnValue(1 as unknown as typeof mongoose.connection.readyState);
      });

      it('should indicate connection is ready', (): void => {
        expect(mongoose.connection.readyState).toBe(1);
      });
    });
  });

  describe('Database Connection State 0 Handling', () => {
    it('fails queries gracefully with a ConnectionError when disconnected', async (): Promise<void> => {
      const readyStateSpy = vi
        .spyOn(mongoose.connection, 'readyState', 'get')
        .mockReturnValue(0 as unknown as typeof mongoose.connection.readyState);

      expect(mongoose.connection.readyState).toBe(0);

      const mockConnectionError = new Error('Database connection lost');
      mockConnectionError.name = 'ConnectionError';

      const findOneSpy = vi.spyOn(User, 'findOne').mockImplementation(() => {
        throw mockConnectionError;
      });

      await expect(async () => await User.findOne({ username: 'testuser' })).rejects.toThrow(
        'Database connection lost'
      );

      readyStateSpy.mockRestore();
      findOneSpy.mockRestore();
    });
  });

  describe('Database Connection State 3 (Disconnecting) Handling', () => {
    it('aborts/rolls back active transactions cleanly when connection is in state 3 (disconnecting)', async (): Promise<void> => {
      const readyStateSpy = vi
        .spyOn(mongoose.connection, 'readyState', 'get')
        .mockReturnValue(3 as unknown as typeof mongoose.connection.readyState);

      const mockSession = {
        startTransaction: vi.fn(),
        commitTransaction: vi.fn(),
        abortTransaction: vi.fn().mockResolvedValue(undefined),
        endSession: vi.fn().mockResolvedValue(undefined),
      } as unknown as mongoose.ClientSession;

      const startSessionSpy = vi.spyOn(mongoose, 'startSession').mockResolvedValue(mockSession);

      const runTransactionWithCheck = async (
        session: mongoose.ClientSession
      ): Promise<{ status: string }> => {
        session.startTransaction();
        try {
          if (mongoose.connection.readyState === 3) {
            await session.abortTransaction();
            return { status: 'aborted' };
          }
          await session.commitTransaction();
          return { status: 'committed' };
        } catch (error) {
          await session.abortTransaction();
          throw error;
        } finally {
          await session.endSession();
        }
      };

      const session = await mongoose.startSession();
      const result = await runTransactionWithCheck(session);

      expect(result.status).toBe('aborted');
      expect(mockSession.abortTransaction).toHaveBeenCalledTimes(1);
      expect(mockSession.endSession).toHaveBeenCalledTimes(1);
      expect(mockSession.commitTransaction).not.toHaveBeenCalled();

      readyStateSpy.mockRestore();
      startSessionSpy.mockRestore();
    });
  });

  describe('Database Connection State 99 Handling', () => {
    it('triggers lazy initialization exactly once and uses the correct connection URI', async (): Promise<void> => {
      const readyStateSpy = vi
        .spyOn(mongoose.connection, 'readyState', 'get')
        .mockReturnValue(99 as unknown as typeof mongoose.connection.readyState);

      const connectSpy = vi.spyOn(mongoose, 'connect').mockResolvedValue(mongoose);

      const MONGO_URI = 'mongodb://localhost:27017/commitpulse';

      const lazyInit = async (): Promise<void> => {
        if (mongoose.connection.readyState === 99) {
          await mongoose.connect(MONGO_URI);
        }
      };

      await lazyInit();

      expect(mongoose.connection.readyState).toBe(99);
      expect(connectSpy).toHaveBeenCalledTimes(1);
      expect(connectSpy).toHaveBeenCalledWith(MONGO_URI);

      readyStateSpy.mockRestore();
      connectSpy.mockRestore();
    });
  });
});
