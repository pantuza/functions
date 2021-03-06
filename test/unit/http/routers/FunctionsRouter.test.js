/* eslint class-methods-use-this: ['error', { "exceptMethods": [
    'listNamespaces', 'getCode', 'deleteCode', 'getCodeByCache', 'compileCode', 'runScript'
]}]*/

const request = require('supertest');
const chai = require('chai');
chai.use(require('chai-string'));

const Sandbox = require('backstage-functions-sandbox');

const expect = chai.expect;
const routes = require('../../../../lib/http/routes');
const Storage = require('../../../../lib/domain/storage');


class FakeStorage extends Storage {
  constructor() {
    super();
    this.lastPutCode = null;
  }

  listNamespaces() {
    return new Promise((accept) => {
      accept({
        items: [
          { namespace: 'namespace1', id: 'function' },
          { namespace: 'namespace2', id: 'function' },
          { namespace: 'namespace3', id: 'function' },
        ],
      });
    });
  }

  getCode(namespace, id) {
    return new Promise((accept, reject) => {
      if (id === 'not-found') {
        accept(null);
      } else if (id === 'error') {
        reject(new Error('Failed to get code'));
      } else {
        accept({
          hash: 'my-hash-123',
          code: 'function main() {}',
        });
      }
    });
  }

  postCode(namespace, id, code) {
    this.lastPutCode = code;
    return new Promise((accept, reject) => {
      if (id === 'exists') {
        reject(new Error('Code already exists'));
      } else if (id === 'error') {
        reject(new Error('Storage error'));
      } else {
        accept([1, 1]);
      }
    });
  }

  putCode(namespace, id, code) {
    this.lastPutCode = code;
    return new Promise((accept, reject) => {
      if (id === 'error') {
        reject(new Error('Storage error'));
      } else {
        accept(null);
      }
    });
  }

  deleteCode(namespace, id) {
    return new Promise((accept, reject) => {
      if (id === 'error') {
        reject(new Error('Storage error'));
      } else {
        accept(null);
      }
    });
  }

  getCodeByCache(namespace, id, { preCache }) {
    return new Promise((accept, reject) => {
      if (id === 'cached') {
        const script = new Sandbox({}).compileCode('cached.js', `
        function main(req, res) {
            res.send({ result: 'cached', body: req.body })
        }`);
        accept({ script });
      } else if (id === 'fresh') {
        const code = `
        function main(req, res) {
            res.send({ result: 'fresh', body: req.body })
        }`;
        accept(preCache({ code }));
      } else if (id === 'error') {
        reject(new Error('Storage error'));
      } else if (id === 'customError') {
        const err = new Error('Custom error');
        err.statusCode = 422;
        reject(err);
      } else if (id === 'not-found') {
        accept(null);
      } else {
        reject(new Error('Unexpected id'));
      }
    });
  }
}


describe('GET /functions', () => {
  before(() => {
    routes.set('memoryStorage', new FakeStorage());
  });

  it('should return namespaces with their functions', (done) => {
    request(routes)
      .get('/functions')
      .expect((res) => {
        expect(res.body.items[0].namespace).to.be.eql('namespace1');
        expect(res.body.items[0].id).to.be.eql('function');
        expect(res.body.items[1].namespace).to.be.eql('namespace2');
        expect(res.body.items[1].id).to.be.eql('function');
        expect(res.body.items[2].namespace).to.be.eql('namespace3');
        expect(res.body.items[2].id).to.be.eql('function');
        expect(res.profile).to.endsWith('/_schemas/functions/list');
      })
      .expect(200, done);
  });
});

describe('POST /functions/:namespace/:id', () => {
  before(() => {
    routes.set('memoryStorage', new FakeStorage());
  });

  describe('when code is correct and does not exists', () => {
    it('should return the code', (done) => {
      const code = 'function main() {}';

      request(routes)
        .post('/functions/backstage/correct')
        .send({ code })
        .expect('Content-Type', /json/)
        .expect((res) => {
          expect(res.profile).to.endsWith('/_schemas/functions/item');
        })
        .expect(() => {
          const memoryStorage = routes.get('memoryStorage');
          expect(memoryStorage.lastPutCode).to.be.eql({
            id: 'correct',
            hash: 'c177063dc3780c2fe9b4fdc913650e8147c9b8b0',
            code,
          });
        })
        .expect(200, {
          id: 'correct',
          code: 'function main() {}',
          hash: 'c177063dc3780c2fe9b4fdc913650e8147c9b8b0',
        }, done);
    });
  });

  describe('when code is correct and exists', () => {
    it('should returns an error', (done) => {
      const code = 'function main() {}';

      request(routes)
        .post('/functions/backstage/exists')
        .send({ code })
        .expect('Content-Type', /json/)
        .expect(500, {
          error: 'Code already exists',
        }, done);
    });
  });

  describe('when return any error from storage', () => {
    it('should return the code', (done) => {
      const code = 'function main() {}';

      request(routes)
        .post('/functions/backstage/error')
        .send({ code })
        .expect('Content-Type', /json/)
        .expect(500, {
          error: 'Storage error',
        }, done);
    });
  });

  describe('when code has a syntax error', () => {
    it('should return a error', (done) => {
      request(routes)
        .post('/functions/backstage/invalid')
        .send({ code: '{)' })
        .expect('Content-Type', /application\/json/)
        .expect(400, {
          error: 'SyntaxError: Unexpected token )',
          stack: '',
        }, done);
    });
  });

  describe('when code has a logic error', () => {
    it('should return a error', (done) => {
      const code = `let a = {};
            function c() {
                a.b();
            };
            c()`;

      request(routes)
        .post('/functions/codes/crazy')
        .send({ code })
        .expect('Content-Type', /json/)
        .expect(400, {
          error: 'TypeError: a.b is not a function',
          stack: 'at c (codes/crazy.js:3)\nat codes/crazy.js:5\nat codes/crazy.js:6',
        }, done);
    });
  });

  describe('when code has a timeout error', () => {
    it('should return a error', (done) => {
      const code = 'while(1) {};';

      request(routes)
        .post('/functions/codes/timeout')
        .send({ code })
        .expect('Content-Type', /json/)
        .expect(400, {
          error: 'Error: Script execution timed out.',
          stack: '',
        }, done);
    });
  });

  describe('when code is not a string', () => {
    it('should return a error', (done) => {
      const code = { wrong: 'yes' };

      request(routes)
        .post('/functions/codes/invalid')
        .send({ code })
        .expect('Content-Type', /^application\/json/)
        .expect(400, {
          error: 'Invalid instance',
          details: [
            'instance.code is not of a type(s) string',
          ],
        }, done);
    });
  });
});

describe('PUT /functions/:namespace/:id', () => {
  before(() => {
    routes.set('memoryStorage', new FakeStorage());
  });

  describe('when code is correct', () => {
    it('should return the code', (done) => {
      const code = 'function main() {}';

      request(routes)
        .put('/functions/backstage/correct')
        .send({ code })
        .expect('Content-Type', /json/)
        .expect(() => {
          const memoryStorage = routes.get('memoryStorage');
          expect(memoryStorage.lastPutCode).to.be.eql({
            id: 'correct',
            hash: 'c177063dc3780c2fe9b4fdc913650e8147c9b8b0',
            code,
          });
        })
        .expect(200, {
          id: 'correct',
          code: 'function main() {}',
          hash: 'c177063dc3780c2fe9b4fdc913650e8147c9b8b0',
        }, done);
    });
  });

  describe('when return any error from storage', () => {
    it('should return the code', (done) => {
      const code = 'function main() {}';

      request(routes)
        .put('/functions/backstage/error')
        .send({ code })
        .expect('Content-Type', /json/)
        .expect(500, {
          error: 'Storage error',
        }, done);
    });
  });

  describe('when code has a syntax error', () => {
    it('should return a error', (done) => {
      request(routes)
        .put('/functions/backstage/invalid')
        .send({ code: '{)' })
        .expect('Content-Type', /application\/json/)
        .expect(400, {
          error: 'SyntaxError: Unexpected token )',
          stack: '',
        }, done);
    });
  });

  describe('when code has a logic error', () => {
    it('should return a error', (done) => {
      const code = `let a = {};
            function c() {
                a.b();
            };
            c()`;

      request(routes)
        .put('/functions/codes/crazy')
        .send({ code })
        .expect('Content-Type', /json/)
        .expect(400, {
          error: 'TypeError: a.b is not a function',
          stack: 'at c (codes/crazy.js:3)\nat codes/crazy.js:5\nat codes/crazy.js:6',
        }, done);
    });
  });

  describe('when code has a timeout error', () => {
    it('should return a error', (done) => {
      const code = 'while(1) {};';

      request(routes)
        .put('/functions/codes/timeout')
        .send({ code })
        .expect('Content-Type', /json/)
        .expect(400, {
          error: 'Error: Script execution timed out.',
          stack: '',
        }, done);
    });
  });

  describe('when code is not a string', () => {
    it('should return a error', (done) => {
      const code = { wrong: 'yes' };

      request(routes)
        .put('/functions/codes/invalid')
        .send({ code })
        .expect('Content-Type', /^application\/json/)
        .expect(400, {
          error: 'Invalid instance',
          details: [
            'instance.code is not of a type(s) string',
          ],
        }, done);
    });
  });
});


describe('GET /functions/:namespace/:id', () => {
  before(() => {
    routes.set('memoryStorage', new FakeStorage());
  });

  describe('when code is not found', () => {
    it('should return 404 error', (done) => {
      request(routes)
        .get('/functions/backstage/not-found')
        .expect((res) => {
          expect(res.body.error).to.be.eql('Code not found');
        })
        .expect(404, done);
    });
  });

  describe('when code is found', () => {
    it('should return the code', (done) => {
      request(routes)
        .get('/functions/backstage/found')
        .expect('ETag', 'my-hash-123')
        .expect((res) => {
          expect(res.body.hash).to.be.eql('my-hash-123');
        })
        .expect(200, done);
    });
  });
});


describe('DELETE /functions/:namespace/:id', () => {
  before(() => {
    routes.set('memoryStorage', new FakeStorage());
  });

  describe('when delete is not sucessfully', () => {
    it('should return 500 error', (done) => {
      request(routes)
        .delete('/functions/backstage/error')
        .expect((res) => {
          expect(res.body.error).to.be.eql('Storage error');
        })
        .expect(500, done);
    });
  });

  describe('when delete is successfully', () => {
    it('should return 204', (done) => {
      request(routes)
        .delete('/functions/backstage/found')
        .expect(204, done);
    });
  });
});


describe('PUT /functions/:namespace/:id/run', () => {
  before(() => {
    routes.set('memoryStorage', new FakeStorage());
    routes.set('sandbox', new Sandbox({}));
  });

  describe('when code is found in cache', () => {
    it('should reuse compiled code from storage cache', (done) => {
      request(routes)
        .put('/functions/backstage/cached/run')
        .send({ args: [1, 2] })
        .expect(200, {
          result: 'cached',
          body: { args: [1, 2] },
        }, done);
    });
  });

  describe('when code is not found in cache', () => {
    it('should compile code from storage', (done) => {
      request(routes)
        .put('/functions/backstage/fresh/run')
        .send({ args: [3, 4] })
        .expect(200, {
          result: 'fresh',
          body: { args: [3, 4] },
        }, done);
    });
  });
  describe('when code is not found in storage', () => {
    it('should return a 404 error', (done) => {
      request(routes)
        .put('/functions/backstage/not-found/run')
        .send({ args: [] })
        .expect(404, {
          error: 'Code \'backstage/not-found\' is not found',
        }, done);
    });
  });

  describe('when error is found', () => {
    it('should return a 500 error', (done) => {
      request(routes)
        .put('/functions/backstage/error/run')
        .send({ args: [] })
        .expect(500, {
          error: 'Storage error',
        }, done);
    });
  });

  describe('when error with custom status code is found', () => {
    it('should return a custom status code', (done) => {
      request(routes)
        .put('/functions/backstage/customError/run')
        .send({ args: [] })
        .expect(422, {
          error: 'Custom error',
        }, done);
    });
  });
});
