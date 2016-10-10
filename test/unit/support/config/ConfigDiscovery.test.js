const expect = require('chai').expect;
const ConfigDiscovery = require('../../../../lib/support/config/ConfigDiscovery');

describe('ConfigDiscovery', () => {
  describe('#getInt', () => {
    before(() => {
      process.env.DEFINED_GET_INT = '50';
    });

    it('should returns the default value when env is not defined', () => {
      expect(ConfigDiscovery.getInt('NOT_DEFINED', 42)).to.be.eql(42);
    });

    it('should returns the defined env', () => {
      expect(ConfigDiscovery.getInt('DEFINED_GET_INT', 0)).to.be.eql(50);
    });
  });

  describe('#getList', () => {
    before(() => {
      process.env.DEFINED_GET_LIST = 'leftpad,  underscore  ,react';
    });

    it('should returns the default list when env is not default', () => {
      const defaultList = ['request', 'lodash', 'leftpad'];
      expect(ConfigDiscovery.getList('NOT_DEFINED', defaultList)).to.be.eql(defaultList);
    });

    it('should returns the defined env', () => {
      const defaultList = ['leftpad', 'underscore', 'react'];
      expect(ConfigDiscovery.getList('DEFINED_GET_LIST', defaultList)).to.be.eql(defaultList);
    });
  });

  describe('#getPossibleString', () => {
    it('should returns the default value when no env is match', () => {
      const possibleString = ConfigDiscovery.getPossibleString(
        ['NOT_DEFINED', 'NOT_DEFINED_2'],
        'possiblestringvalue'
      );
      expect(possibleString).to.be.eql('possiblestringvalue');
    });
  });

  describe.skip('#parseRedisOptions', () => {
    it('should parse the default redis options');
  });
});