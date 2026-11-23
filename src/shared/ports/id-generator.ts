// Puerto de generación de ids (UUID).
export interface IdGenerator {
  newId(): string;
}
