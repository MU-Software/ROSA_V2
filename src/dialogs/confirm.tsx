import type { FC, PropsWithChildren } from 'react'
import { PhDialog } from "../components/elements/dialog"

type ConfirmDialogProps = PropsWithChildren<{
  title?: string
  dialogKey: string
  currentDialogKey: string | null
  onCancel?: () => void
  onConfirm: () => void
}>

export const ConfirmDialog: FC<ConfirmDialogProps> = ({ title, children, dialogKey, currentDialogKey, onCancel, onConfirm }) => {
  return <PhDialog
    title={title}
    dialogKey={dialogKey}
    currentDialogKey={currentDialogKey}
    onCancel={onCancel}
    onConfirm={onConfirm}
    children={children}
  />;
}
