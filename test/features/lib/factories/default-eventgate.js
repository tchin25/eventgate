'use strict';

const bunyan = require('bunyan');
const assert = require('assert');
const P = require('bluebird');

const eventgateModule = require('../../../../lib/factories/default-eventgate');

const logger = bunyan.createLogger({ name: 'test/EventValidator', level: 'fatal' });

const {
    EventInvalidError
} = require('../../../../lib/error');


describe('default-eventgate makeExtractSchemaUri', () => {

    it('Should make function that extracts schema uri from string config', () => {
        const extractSchemaUri = eventgateModule.makeExtractSchemaUri({
            schema_uri_field: 'meta.schema_uri'
        });


        const expectedSchemaUri = '/cool/schema';
        const event0 = { name: 'event0', meta: { schema_uri: expectedSchemaUri } };
        const event1 = { name: 'event1', meta: { } };

        assert.equal(extractSchemaUri(event0), expectedSchemaUri);
        assert.throws(() => {
            extractSchemaUri(event1);
        });
    });

    it('Should make function that extracts schema uri from array config', () => {
        const extractSchemaUri = eventgateModule.makeExtractSchemaUri({
            schema_uri_field: ['$schema', 'meta.schema_uri']
        });

        const expectedSchemaUri = '/cool/schema';
        const event0 = { name: 'event0', meta: { schema_uri: expectedSchemaUri } };
        const event1 = { name: 'event1', meta: { } };
        const event2 = { name: 'event2', $schema: expectedSchemaUri };

        assert.equal(extractSchemaUri(event0), expectedSchemaUri);
        assert.equal(extractSchemaUri(event2), expectedSchemaUri);

        assert.throws(() => {
            extractSchemaUri(event1);
        });
    });

});


describe('default-eventgate makeExtractStream', () => {
    it('Should make function that extracts stream name', () => {
        const extractStream = eventgateModule.makeExtractStream({
            schema_uri_field: 'meta.schema_uri',
            stream_field: 'meta.stream'
        });

        const event0 = { name: 'event0', meta: { stream: 'cool_stream' } };
        const event1 = { name: 'event1', meta: { } };

        assert.equal(extractStream(event0), 'cool_stream');
        assert.throws(() => {
            extractStream(event1);
        });
    });

    it('Should make function that extracts stream name from schema_uri', () => {
        const extractStream = eventgateModule.makeExtractStream({
            schema_uri_field: 'meta.schema_uri'
        });

        const event0 = { name: 'event0', meta: { schema_uri: '/cool/schema' } };

        assert.equal(extractStream(event0), 'cool_schema');
    });
});


describe('default-eventgate makeValidate', () => {

    const options = {
        // TODO change these when we have a new draft 7 schema in event-schemas repo
        schema_base_uri: './test/schemas/',
        schema_uri_field: '$schema',
        stream_field: 'meta.stream'
    };

    const validate = eventgateModule.makeValidate(options, logger);

    it('Should make function that resolves schema uris and validates events', async() => {
        const validate = eventgateModule.makeValidate(options, logger);

        const testEvent_v1_0 = {
            '$schema': '/test/0.0.1',
            meta: {
                stream: 'test.event',
                id: '5e1dd101-641c-11e8-ab6c-b083fecf1287',
            },
            test: 'test_value_0'
        };

        const validEvent = await validate(testEvent_v1_0);
        assert.deepEqual(validEvent, testEvent_v1_0);
    });

    it('Should make function that resolves schema uris and validates draft 04 events', async() => {
        const validate = eventgateModule.makeValidate(options, logger);

        const validate2 = eventgateModule.makeValidate(options, logger);

        const testEvent_draft4 = {
            '$schema': '/test_draft4/0.0.1',
            meta: {
                stream: 'test_draft4.event',
                id: '5e1dd101-641c-11e8-ab6c-b083fecf1287',
            },
            test: 'test_value_0'
        };

        const validEvent = await validate(testEvent_draft4);
        assert.deepEqual(validEvent, testEvent_draft4);
        // console.log('AJV1', validate.eventValidator.ajv._cache);

        // console.log('AJV2', validate2.eventValidator.ajv._cache);
        // assert.notStrictEqual(validate.eventValidator.ajv, validate2.eventValidator.ajv);
        await validate2(testEvent_draft4);

    });


    it('Should throw an error for invalid event', async() => {
        const validate = await eventgateModule.makeValidate(options, logger);

        const testInvalidEvent = {
            '$schema': '/test/0.0.1',
            meta: {
                stream: 'test.event',
                id: '5e1dd101-641c-11e8-ab6c-b083fecf1289',
            },
            test: 1234
        };

        let threwError = false;
        try {
            await validate(testInvalidEvent);
        } catch (err) {
            assert(err instanceof EventInvalidError);
            threwError = true;
        }
        if (!threwError) {
            assert.fail(`Event should have have thrown error`);
        }
    });


    describe('default-eventgate makeProduce', () => {

        it('Should make a function that uses stream for topic from event and produces', async() => {

            const testEvent_v1_0 = {
                '$schema': '/test/0.0.1',
                meta: {
                    stream: 'test.event',
                    id: '5e1dd101-641c-11e8-ab6c-b083fecf1287',
                },
                test: 'test_value_0'
            };

            const options = {
                schema_uri_field: '$schema',
                stream_field: 'meta.stream',
                topic_prefix: 'test_it',
            };

            const mocKafkaProducer = {
                produce: (topic, partition, message, key) => {
                    return P.resolve([{
                        topic,
                        partition: 0,
                        offset: 1,
                        key: key,
                        opaque: { },
                        timestamp: 1539629252472,
                        size: message.length
                    }]);
                }
            };

            const produce = eventgateModule.makeProduce(options, mocKafkaProducer);

            const produceResult = await produce(testEvent_v1_0);
            assert.strictEqual(produceResult[0].topic, 'test.event');
        });
    });

    it('Should make a function that uses schema_uri for topic from event and produces', async() => {

        const testEvent_v1_0 = {
            '$schema': '/test/0.0.1',
            meta: {
                stream: 'test.event',
                id: '5e1dd101-641c-11e8-ab6c-b083fecf1287',
            },
            test: 'test_value_0'
        };

        // stream_field not set in options, makeProduce should fallback to
        // sanitizing and using schema_uri.
        const options = {
            schema_uri_field: '$schema',
            topic_prefix: 'test_it',
        };

        const mocKafkaProducer = {
            produce: (topic, partition, message, key) => {
                return P.resolve([{
                    topic,
                    partition: 0,
                    offset: 1,
                    key: key,
                    opaque: { },
                    timestamp: 1539629252472,
                    size: message.length
                }]);
            }
        };

        const produce = eventgateModule.makeProduce(options, mocKafkaProducer);

        const produceResult = await produce(testEvent_v1_0);
        assert.strictEqual(produceResult[0].topic, 'test_0.0.1');
    });

});