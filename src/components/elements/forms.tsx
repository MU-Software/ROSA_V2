import { FormControlLabel, MenuItem, Switch, TextField, type SwitchProps, type TextFieldProps } from "@mui/material";
import type { ReactNode } from "react";
import { Controller, type ControllerProps, type FieldValues } from "react-hook-form";

type FormInputProps<T extends FieldValues, I> = Omit<ControllerProps<T>, "render"> & {
  label?: ReactNode;
  inputProps?: I;
};

export type SelectOption = {
  value: string | number;
  label: ReactNode;
};

export const FormSwitch = <T extends FieldValues>({ label, inputProps, ...props }: FormInputProps<T, SwitchProps>) => (
  <Controller {...props} render={({ field }) => (
    <FormControlLabel
      control={<Switch {...inputProps} {...field} checked={!!field.value} />}
      label={label ?? props.name}
    />
  )} />
);

export const FormTextField = <T extends FieldValues>({ label, inputProps, ...props }: FormInputProps<T, TextFieldProps>) => (
  <Controller {...props} render={({ field }) => (
    <TextField label={label} {...inputProps} {...field} />
  )} />
);

export const FormSelect = <T extends FieldValues>(
  { label, inputProps, options, emptyLabel, ...props }: FormInputProps<T, TextFieldProps> & {
    options: SelectOption[];
    emptyLabel?: string;
  },
) => (
  <Controller {...props} render={({ field }) => (
    <TextField select label={label} {...inputProps} {...field} value={field.value ?? ""}>
      {options.length === 0 && <MenuItem value="" disabled>{emptyLabel ?? "(없음)"}</MenuItem>}
      {options.map((o) => <MenuItem key={o.value} value={o.value}>{o.label}</MenuItem>)}
    </TextField>
  )} />
);
