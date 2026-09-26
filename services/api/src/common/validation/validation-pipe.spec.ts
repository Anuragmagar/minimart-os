import { IsInt, IsString, Min, validate } from 'class-validator';
import { ValidationError } from 'class-validator';
import { toFieldErrors } from './validation-pipe.js';

class CreateItemDto {
  @IsString()
  name!: string;

  @IsInt()
  @Min(1)
  qty!: number;
}

describe('validation-pipe', () => {
  it('flattens top-level constraint errors into field_errors', async () => {
    const dto = Object.assign(new CreateItemDto(), { name: 5, qty: 0 });
    const errors: ValidationError[] = await validate(dto);
    const fieldErrors = toFieldErrors(errors);
    expect(fieldErrors).toHaveProperty('name');
    expect(fieldErrors.name).toEqual(
      expect.arrayContaining([expect.stringContaining('must be a string')]),
    );
    expect(fieldErrors).toHaveProperty('qty');
    expect(fieldErrors.qty).toEqual(
      expect.arrayContaining([expect.stringMatching(/less than/i)]),
    );
  });

  it('passes through a valid input without errors', async () => {
    const dto = Object.assign(new CreateItemDto(), { name: 'apple', qty: 2 });
    const errors: ValidationError[] = await validate(dto);
    expect(errors).toHaveLength(0);
    expect(toFieldErrors(errors)).toEqual({});
  });
});
