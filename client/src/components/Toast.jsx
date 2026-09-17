import PropTypes from "prop-types";
import { useEffect } from "react";
import { Icon } from "semantic-ui-react";

function Toast({ toasts, onDismiss }) {
  useEffect(() => {
    if (toasts.length === 0) return;
    const latest = toasts[toasts.length - 1];
    const timer = setTimeout(() => onDismiss(latest.id), 3000);
    return () => clearTimeout(timer);
  }, [toasts, onDismiss]);

  if (toasts.length === 0) return null;

  return (
    <div className="toast-container" role="status" aria-live="polite">
      {toasts.map((t) => (
        <div key={t.id} className={`toast toast--${t.type || "success"}`}>
          <Icon name={t.type === "error" ? "times circle" : "check circle"} />
          <span className="toast-message">{t.message}</span>
          <button className="toast-close" onClick={() => onDismiss(t.id)} aria-label="Fermer">×</button>
        </div>
      ))}
    </div>
  );
}

Toast.propTypes = {
  toasts: PropTypes.arrayOf(
    PropTypes.shape({
      id: PropTypes.number.isRequired,
      message: PropTypes.string.isRequired,
      type: PropTypes.oneOf(["success", "error"]),
    }),
  ).isRequired,
  onDismiss: PropTypes.func.isRequired,
};

export default Toast;
