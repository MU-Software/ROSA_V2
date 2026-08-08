import { FormControlLabel, Switch, TextField, type SwitchProps, type TextFieldProps } from "@mui/material";
import type { ReactNode } from "react";
import { Controller, type ControllerProps, type FieldValues } from "react-hook-form";

type FormInputProps<T extends FieldValues, I> = Omit<ControllerProps<T>, "render"> & {
  label?: ReactNode;
  inputProps?: I;
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

