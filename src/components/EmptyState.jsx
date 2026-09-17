export default function EmptyState({ icon, title, description, action }) {
  return (
    <div className="flex flex-col items-center justify-center py-16 px-6 text-center">
      <div className="text-5xl mb-4">{icon}</div>
      <h3 className="text-content font-semibold text-lg mb-2">{title}</h3>
      {description && (
        <p className="text-content-dim text-sm max-w-xs">{description}</p>
      )}
      {action && (
        <div className="mt-6">{action}</div>
      )}
    </div>
  )
}
