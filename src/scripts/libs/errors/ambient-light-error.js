export class AmbientlightError extends Error {
  constructor(message, details) {
    super(message);
    this.details = details;
  }
}
