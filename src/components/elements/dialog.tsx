import {
  Button,
  Dialog,
  DialogActions,
  DialogContent,
  DialogTitle,
  type Breakpoint,
  type DialogProps,
} from '@mui/material'
import type { FC, PropsWithChildren } from 'react'

type CommonDialogProps = PropsWithChildren<{
  dialogKey: string
  currentDialogKey: string | null
  title?: string
  size?: Breakpoint | 'fullWidth' | 'fullScreen'

  onCancel?: () => void
  onConfirm?: () => void
  onClose?: DialogProps["onClose"]
}>

export const PhDialog: FC<CommonDialogProps> = ({
  dialogKey,
  currentDialogKey,
  title,
  size,
  children,
  onConfirm,
  onCancel,
  onClose,
}) => {
  const props: DialogProps = {
    maxWidth: size === 'fullWidth' || size === 'fullScreen' ? null : size,
    fullScreen: size === 'fullScreen',
    fullWidth: size === 'fullWidth',
    open: currentDialogKey === dialogKey,
    onClose,
  };
  return (
    <Dialog {...props}>
      {title && <DialogTitle children={title} />}
      <DialogContent dividers children={children} />

      <DialogActions>
        {onCancel && <Button onClick={onCancel} children="취소" />}
        {onConfirm && <Button onClick={onConfirm} children="확인" />}
      </DialogActions>
    </Dialog>
  )
};
