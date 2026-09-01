import { Component } from "react";
import { Container, Message } from "semantic-ui-react";

export default class ErrorBoundary extends Component {
  constructor(props) {
    super(props);
    this.state = { error: null };
  }

  static getDerivedStateFromError(error) {
    return { error };
  }

  componentDidCatch(error, info) {
    console.error("[ErrorBoundary]", error, info.componentStack);
  }

  render() {
    if (this.state.error) {
      return (
        <Container style={{ marginTop: "2rem" }}>
          <Message negative>
            <Message.Header>Erreur inattendue</Message.Header>
            <p>{this.state.error.message}</p>
            <p style={{ fontSize: "0.85em", opacity: 0.7 }}>Rechargez la page pour réessayer.</p>
          </Message>
        </Container>
      );
    }
    return this.props.children;
  }
}
