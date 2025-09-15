import mongoose from 'mongoose';

const submissionSchema = new mongoose.Schema(
  {
    payload:   { type: Object, required: true },
    computed:  { type: Object },
    createdAt: { type: Date, default: Date.now }
  },
  { collection: 'Submissions' }
);

const Submission = mongoose.model('Submission', submissionSchema);
export default Submission;