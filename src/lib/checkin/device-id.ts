const DEVICE_ID_KEY = 'prezva-device-id'

let memoryDeviceId: string | null = null

// One id per browser, shared by the door and session offline queues.
// localStorage can be unavailable or throw (partitioned storage in the GHL
// iframe, private mode); a missing device id must never stop a scan queueing.
export function getDeviceId(): string {
  try {
    let id = localStorage.getItem(DEVICE_ID_KEY)
    if (!id) {
      id = crypto.randomUUID()
      localStorage.setItem(DEVICE_ID_KEY, id)
    }
    return id
  } catch {
    memoryDeviceId ??= crypto.randomUUID()
    return memoryDeviceId
  }
}
