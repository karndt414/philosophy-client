import React, { useState, useEffect, useRef } from 'react';
import io from 'socket.io-client';
import './App.css'; // We will create this file next

// Connect to your backend server's "walkie-talkie"
const socket = io('http://localhost:3001');

function App() {
  const [username, setUsername] = useState('Anonymous');
  const [questions, setQuestions] = useState([]); // All philosophy questions
  const [selectedQuestion, setSelectedQuestion] = useState(null); // The one we are chatting in
  const [messages, setMessages] = useState([]); // Messages for the selected question
  const [newMessage, setNewMessage] = useState('');
  const messagesEndRef = useRef(null); // To auto-scroll to bottom

  // --- Data Fetching Effects ---

  // 1. Get the list of questions from the "Librarian" when the app loads
  useEffect(() => {
    fetch('http://localhost:3001/api/questions')
      .then((res) => res.json())
      .then((data) => setQuestions(data));
  }, []);

  // 2. When we click a question...
  useEffect(() => {
    if (selectedQuestion) {
      // a) ...ask the "Librarian" for all the old messages for this question
      fetch(`http://localhost:3001/api/messages/${selectedQuestion.id}`)
        .then((res) => res.json())
        .then((data) => setMessages(data));

      // b) ...tell our "walkie-talkie" we are joining this question's "room"
      socket.emit('join_question', selectedQuestion.id);
    }
  }, [selectedQuestion]); // This code re-runs every time 'selectedQuestion' changes

  // 3. Listen for incoming broadcasts on our "walkie-talkie"
  useEffect(() => {
    // When the 'receive_message' event comes in...
    socket.on('receive_message', (message) => {
      // ...add the new message to our list
      if (message.question_id === selectedQuestion?.id) {
        setMessages((prevMessages) => [...prevMessages, message]);
      }
    });

    // Clean up the listener when the component closes
    return () => {
      socket.off('receive_message');
    };
  }, [selectedQuestion]); // Re-run if selectedQuestion changes

  // Auto-scroll to the latest message
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);


  // --- Event Handlers ---

  // This runs when we click the "Send" button
  const handleSendMessage = (e) => {
    e.preventDefault();
    if (newMessage.trim() === '' || !selectedQuestion) return;

    // This is the message object we send to the server
    const messageData = {
      question_id: selectedQuestion.id,
      username: username,
      content: newMessage,
    };

    // Send the message to the server on the "walkie-talkie"
    socket.emit('send_message', messageData);
    setNewMessage(''); // Clear the input box
  };

  // --- What to Show on the Page ---
  return (
    <div className="App">
      <div className="sidebar">
        <h2>Philosophy Questions</h2>
        <div className="username-input">
          <label>Your Name: </label>
          <input
            type="text"
            value={username}
            onChange={(e) => setUsername(e.target.value)}
          />
        </div>
        <ul>
          {questions.map((q) => (
            <li
              key={q.id}
              className={selectedQuestion?.id === q.id ? 'active' : ''}
              onClick={() => setSelectedQuestion(q)}
            >
              {q.title}
            </li>
          ))}
        </ul>
      </div>

      <div className="chat-room">
        {selectedQuestion ? (
          <>
            <h2>{selectedQuestion.title}</h2>
            <div className="message-list">
              {messages.map((msg) => (
                <div key={msg.id} className="message">
                  <strong>{msg.username}: </strong>
                  <span>{msg.content}</span>
                  <small>{new Date(msg.timestamp).toLocaleTimeString()}</small>
                </div>
              ))}
              <div ref={messagesEndRef} /> {/* Auto-scroll target */}
            </div>
            <form className="message-form" onSubmit={handleSendMessage}>
              <input
                type="text"
                value={newMessage}
                onChange={(e) => setNewMessage(e.target.value)}
                placeholder="Type your thoughts..."
              />
              <button type="submit">Send</button>
            </form>
          </>
        ) : (
          <div className="placeholder">
            <h2>Select a question to start chatting</h2>
          </div>
        )}
      </div>
    </div>
  );
}

export default App;