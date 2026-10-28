import test from 'node:test'; import assert from 'node:assert/strict';
import { regressionHash, regressionCaseHash } from '../tools/regression-serialization.mjs';
test('snapshot normalization tolerates evidenced last-bit runtime noise, while retaining numeric regression sensitivity',()=>{
 assert.equal(regressionHash({tlc:3.396874876979536}),regressionHash({tlc:3.3968748769795365}));
 assert.notEqual(regressionHash({tlc:3.396874876979536}),regressionHash({tlc:3.396874877979536}));
 assert.notEqual(regressionHash({pass:true,z:-2.5}),regressionHash({pass:false,z:-2.5}));
 assert.notEqual(regressionHash({value:null,status:'unavailable'}),regressionHash({value:0,status:'normal'}));
 assert.equal(regressionCaseHash({x:1,scenario:{level:'none'}}),regressionCaseHash({x:1}));
});
