import * as assert from "assert";
import { MediaTypes } from "../../src/const/ENUM";
import { EventService, type IEvent } from "../../src/service/event.service";

suite("Publishing events", () => {
	test("does not schedule a duplicate publishing task", () => {
		const service = Object.create(EventService.prototype) as EventService;
		service.setEvents([]);
		service.persist = () => undefined;
		const first = event("same-content");
		const duplicate = event("same-content");

		assert.strictEqual(service.registerEvent(first), true);
		assert.strictEqual(service.registerEvent(duplicate), false);
		assert.ok(first.timeoutId);
		assert.strictEqual(duplicate.timeoutId, undefined);
		service.destroyEvent(first.hash);
	});

	test("does not publish after the task record fails to save", () => {
		const service = Object.create(EventService.prototype) as EventService;
		service.setEvents([]);
		service.persist = () => { throw new Error("无法保存任务"); };
		const task = event("new-content");

		assert.throws(() => service.registerEvent(task), /无法保存任务/);
		assert.strictEqual(task.timeoutId, undefined);
		assert.deepStrictEqual(service.getEvents(), []);
	});
});

function event(hash: string): IEvent {
	return {
		type: MediaTypes.article,
		content: "正文",
		hash,
		date: new Date(Date.now() + 60_000),
		handler: () => undefined,
	};
}
