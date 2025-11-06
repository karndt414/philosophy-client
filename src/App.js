// src/App.js
import React, { useState, useEffect, useRef } from 'react';
import { supabase } from './supabaseClient'; // Import your client
import './App.css';

function App() {
  const [username, setUsername] = useState(''); // <-- Will be set on login
  const [isLoggedIn, setIsLoggedIn] = useState(false); // <-- Our new "gate"
  const [nameInput, setNameInput] = useState(''); // <-- For the login form input
  const [questions, setQuestions] = useState([]);
  const [selectedQuestion, setSelectedQuestion] = useState(null);
  const [messages, setMessages] = useState([]);
  const [newMessage, setNewMessage] = useState('');
  const [newQuestionTitle, setNewQuestionTitle] = useState('');
  const [adminPassword, setAdminPassword] = useState('');
  const messagesEndRef = useRef(null);

  // 1. Fetch all questions on component mount
  useEffect(() => {
    async function getQuestions() {
      const { data, error } = await supabase.from('questions').select('*');
      if (error) console.error('Error fetching questions:', error);
      else setQuestions(data);
    }
    getQuestions();
  }, []);

  // 2. Fetch messages when a question is selected
  useEffect(() => {
    if (selectedQuestion) {
      async function getMessages() {
        const { data, error } = await supabase
          .from('messages')
          .select('*')
          .eq('question_id', selectedQuestion.id)
          .order('created_at', { ascending: true });

        if (error) console.error('Error fetching messages:', error);
        else setMessages(data);
      }
      getMessages();
    }
  }, [selectedQuestion]);

  // 3. Listen for REAL-TIME new messages
  useEffect(() => {
    if (!selectedQuestion) return;

    const channel = supabase
      .channel(`question_room_${selectedQuestion.id}`)
      .on(
        'postgres_changes',
        {
          event: '*', // <-- CHANGE 'INSERT' TO '*'
          schema: 'public',
          table: 'messages',
          filter: `question_id=eq.${selectedQuestion.id}`,
        },
        (payload) => {
          if (payload.eventType === 'INSERT') {
            // A new message has arrived!
            setMessages((prevMessages) => [...prevMessages, payload.new]);
          }
          if (payload.eventType === 'DELETE') {
            // A message was deleted!
            // payload.old.id will give us the ID of the deleted message
            setMessages((prevMessages) =>
              prevMessages.filter((msg) => msg.id !== payload.old.id)
            );
          }
        }
      )
      .subscribe();

    // Cleanup: Unsubscribe when the component unmounts or question changes
    return () => {
      supabase.removeChannel(channel);
    };

  }, [selectedQuestion]);

  // 4. Listen for REAL-TIME new questions (ADD THIS)
  useEffect(() => {
    const channel = supabase
      .channel('all-questions')
      .on(
        'postgres_changes',
        {
          event: '*', // <-- CHANGE 'INSERT' TO '*'
          schema: 'public',
          table: 'questions',
        },
        (payload) => {
          if (payload.eventType === 'INSERT') {
            // Add the new question to our list
            setQuestions((prevQuestions) => [...prevQuestions, payload.new]);
          }
          if (payload.eventType === 'DELETE') {
            // A question was deleted!
            setQuestions((prevQuestions) =>
              prevQuestions.filter((q) => q.id !== payload.old.id)
            );
          }
        }
      )
      .subscribe();

    // Cleanup
    return () => {
      supabase.removeChannel(channel);
    };
  }, []); // Run this only once when the app loads

  // Auto-scroll to the latest message
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  // --- Event Handlers ---

  const handleLogin = (e) => {
    e.preventDefault();
    if (nameInput.trim() === '') {
      alert('Please enter a name!');
      return;
    }
    setUsername(nameInput.trim());
    setIsLoggedIn(true);
  };

  const handleAddQuestion = async (e) => {
    e.preventDefault();
    if (newQuestionTitle.trim() === '' || adminPassword.trim() === '') {
      alert('Please fill out all admin fields.');
      return;
    }

    // This calls your 'add-question' Edge Function
    const { data, error } = await supabase.functions.invoke('RealTime', {
      body: {
        title: newQuestionTitle,
        password: adminPassword,
      },
    });

    if (error) {
      alert(`Error: ${error.message}`);
    } else {
      // Success! The Realtime listener (step 2) will
      // automatically add the question to the list.
      console.log('New question added:', data);
      setNewQuestionTitle('');
      setAdminPassword('');
    }
  };

  const handleDeleteQuestion = async (questionId) => {
    const password = prompt("Enter admin password to delete this question:");
    if (!password) return; // User clicked cancel

    const { error } = await supabase.functions.invoke('delete-question', {
      body: {
        question_id: questionId,
        password: password,
      },
    });

    if (error) {
      alert(`Error: ${error.message}`);
    } else {
      // The Realtime listener will handle the UI update!
      alert('Question deleted.');
      // If we deleted the *selected* question, un-select it
      if (selectedQuestion?.id === questionId) {
        setSelectedQuestion(null);
      }
    }
  };

  // ADD THIS FUNCTION
  const handleDeleteMessage = async (messageId) => {
    const password = prompt("Enter admin password to delete this message:");
    if (!password) return; // User clicked cancel

    const { error } = await supabase.functions.invoke('delete-message', {
      body: {
        message_id: messageId,
        password: password,
      },
    });

    if (error) {
      alert(`Error: ${error.message}`);
    } else {
      // The Realtime listener will handle the UI update!
      alert('Message deleted.');
    }
  };

  const handleSendMessage = async (e) => {
    e.preventDefault();
    if (newMessage.trim() === '' || !selectedQuestion) return;

    // Send the new message to the Supabase database
    const { error } = await supabase.from('messages').insert({
      question_id: selectedQuestion.id,
      username: username,
      content: newMessage,
    });

    if (error) console.error('Error sending message:', error);

    setNewMessage(''); // Clear the input box
  };

  // --- Render ---
  // (This JSX is almost identical to your old file, so I'm
  // including it for completeness. I just removed the admin form for now.)
  if (!isLoggedIn) {
    return (
      <div className="login-container">
        <form className="login-box" onSubmit={handleLogin}>
          <h2>Welcome to TigerTalks</h2>
          <p>Please enter your name to join the discussion</p>
          <input
            type="text"
            placeholder="Your Name"
            value={nameInput}
            onChange={(e) => setNameInput(e.target.value)}
          />
          <button type="submit">Join Chat</button>
        </form>
      </div>
    );
  }

  return (
    <div className="App">
      <div className="sidebar">
        <h2>Tiger Talks</h2>
        <details className="admin-details">
          <summary>Add Question</summary>
          <form className="admin-form" onSubmit={handleAddQuestion}>
            <input
              type="text"
              placeholder="New question title"
              value={newQuestionTitle}
              onChange={(e) => setNewQuestionTitle(e.target.value)}
            />
            <input
              type="password"
              placeholder="Admin password"
              value={adminPassword}
              onChange={(e) => setAdminPassword(e.target.value)}
            />
            <button type="submit">Add</button>
          </form>
        </details>
        <ul>
          {questions.map((q) => (
            <li
              key={q.id}
              className={selectedQuestion?.id === q.id ? 'active' : ''}
              onClick={() => setSelectedQuestion(q)}
            >
              {q.title}
              <button
                className="delete-btn"
                onClick={(e) => {
                  e.stopPropagation(); // Stop it from selecting the question
                  handleDeleteQuestion(q.id);
                }}
              >
                &times;
              </button>
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
                  <small>{new Date(msg.created_at).toLocaleTimeString()}</small>
                  <button
                    className="delete-btn"
                    onClick={() => handleDeleteMessage(msg.id)}
                  >
                    &times;
                  </button>
                </div>
              ))}
              <div ref={messagesEndRef} />
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