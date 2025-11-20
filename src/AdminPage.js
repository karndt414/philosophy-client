import React, { useState, useEffect } from 'react';
import { supabase } from './supabaseClient'; // Import your client
import './AdminPage.css'; // We'll create this file next

// This is our new component.
// It receives 'onBack' as a prop so it can tell App.js to go back.
function AdminPage({ onBack }) {
    const [users, setUsers] = useState([]);
    const [loading, setLoading] = useState(true);

    // 1. Fetch all users from the 'profiles' table on load
    // 1. Fetch all users from the 'profiles' table on load
    useEffect(() => {
        const fetchUsers = async () => {
            setLoading(true);

            // --- THIS IS THE FIX ---
            // If RLS is disabled, this is the correct query.
            const { data, error } = await supabase
                .from('profiles')
                .select('id, username, is_admin'); // Get all users

            if (error) {
                console.error('Error fetching users:', error);
            } else {
                setUsers(data);
            }
            setLoading(false);
        };

        fetchUsers();
    }, []);

    // 2. The handler to change a user's admin status
    const handleSetAdmin = async (userId, newStatus) => {
        // Optimistic UI update: update the state immediately
        setUsers(
            users.map((user) =>
                user.id === userId ? { ...user, is_admin: newStatus } : user
            )
        );

        // Call the secure SQL function we created
        const { error } = await supabase.rpc('set_admin_status', {
            user_id: userId,
            new_status: newStatus,
        });

        if (error) {
            console.error('Failed to update admin status:', error);
            // If it failed, revert the change
            alert('Error: ' + error.message);
            setUsers(
                users.map((user) =>
                    user.id === userId ? { ...user, is_admin: !newStatus } : user
                )
            );
        }
    };

    if (loading) {
        return <div className="admin-page">Loading...</div>;
    }

    // 3. Render the list of users
    return (
        <div className="admin-page">
            <div className="admin-header">
                <h2>Admin Settings</h2>
                <button onClick={onBack} className="admin-back-btn">
                    &larr; Back to Chat
                </button>
            </div>

            <h3>Manage Users</h3>
            <table className="user-table">
                <thead>
                    <tr>
                        <th>Username</th>
                        <th>Is Admin?</th>
                        <th>Actions</th>
                    </tr>
                </thead>
                <tbody>
                    {users.map((user) => (
                        <tr key={user.id}>
                            <td>{user.username}</td>
                            <td>{user.is_admin ? 'Yes' : 'No'}</td>
                            <td>
                                {user.is_admin ? (
                                    <button
                                        className="admin-action-btn remove"
                                        onClick={() => handleSetAdmin(user.id, false)}
                                    >
                                        Remove Admin
                                    </button>
                                ) : (
                                    <button
                                        className="admin-action-btn make"
                                        onClick={() => handleSetAdmin(user.id, true)}
                                    >
                                        Make Admin
                                    </button>
                                )}
                            </td>
                        </tr>
                    ))}
                </tbody>
            </table>
        </div>
    );
}

export default AdminPage;