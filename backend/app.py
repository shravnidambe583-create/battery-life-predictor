from flask import Flask, request, jsonify, send_file
from flask_cors import CORS
import pandas as pd
import numpy as np
from sklearn.linear_model import LinearRegression
import os
import io
import re
from datetime import datetime

# Import ReportLab modules safely
from reportlab.lib.pagesizes import letter
from reportlab.platypus import SimpleDocTemplate, Paragraph, Spacer, Table, TableStyle
from reportlab.lib.styles import getSampleStyleSheet, ParagraphStyle
from reportlab.lib import colors

app = Flask(__name__)
CORS(app) # Enable CORS for frontend integration

# Resolve dataset path
BASE_DIR = os.path.dirname(os.path.abspath(__file__))
CSV_PATH = os.path.join(BASE_DIR, 'Mobile_Battery_Life_Prediction_Dataset.csv')

# Load and fit model
df = pd.read_csv(CSV_PATH)
X = df[['Screen_Time_Hours']]
y = df['Battery_Remaining_Percent']

model = LinearRegression()
model.fit(X, y)

# Model details
slope = model.coef_[0]
intercept = model.intercept_
r2_score = model.score(X, y)
mean_screen_time = df['Screen_Time_Hours'].mean()

# Statistical bounds
min_battery = float(df['Battery_Remaining_Percent'].min())
max_battery = float(df['Battery_Remaining_Percent'].max())
avg_battery = float(df['Battery_Remaining_Percent'].mean())

@app.route('/api/stats', methods=['GET'])
def get_stats():
    return jsonify({
        'success': True,
        'count': len(df),
        'min_battery': min_battery,
        'max_battery': max_battery,
        'avg_battery': round(avg_battery, 2),
        'mean_screen_time': round(mean_screen_time, 2),
        'r2_score': round(r2_score, 4),
        'equation': f"Battery % = {intercept:.2f} + ({slope:.2f} * Screen Time)",
        'intercept': round(intercept, 2),
        'slope': round(slope, 4)
    })

@app.route('/api/chart-data', methods=['GET'])
def get_chart_data():
    # Format actual data points
    scatter_points = []
    for _, row in df.iterrows():
        scatter_points.append({
            'x': float(row['Screen_Time_Hours']),
            'y': float(row['Battery_Remaining_Percent'])
        })
    
    # Sort dataset to generate regression line endpoints
    min_x = float(df['Screen_Time_Hours'].min())
    max_x = float(df['Screen_Time_Hours'].max())
    
    # Generate 15 points along the regression line
    line_x = np.linspace(min_x, max_x, 15)
    line_y = model.predict(line_x.reshape(-1, 1))
    
    regression_line = []
    for x_val, y_val in zip(line_x, line_y):
        regression_line.append({
            'x': round(float(x_val), 2),
            'y': round(max(0.0, min(100.0, float(y_val))), 2)
        })
        
    return jsonify({
        'success': True,
        'scatter': scatter_points,
        'regression': regression_line
    })

@app.route('/api/predict', methods=['POST'])
def predict():
    try:
        data = request.get_json()
        if not data or 'screen_time_hours' not in data:
            return jsonify({'success': False, 'error': 'Missing screen_time_hours field.'}), 400
        
        try:
            screen_time = float(data['screen_time_hours'])
        except ValueError:
            return jsonify({'success': False, 'error': 'Screen time must be a number.'}), 400
            
        if screen_time < 0 or screen_time > 24:
            return jsonify({'success': False, 'error': 'Screen time must be between 0 and 24 hours.'}), 400
            
        # Prediction
        prediction_val = model.predict([[screen_time]])[0]
        clamped_val = max(0.0, min(100.0, prediction_val))
        
        # Calculate mock confidence score
        dist_from_mean = abs(screen_time - mean_screen_time)
        confidence = max(80.0, 98.0 - (dist_from_mean * 2.5))
        
        # Health status definition
        if clamped_val >= 80.0:
            health_status = "Excellent"
            health_indicator = "🟢"
            health_color = "#10b981"
        elif clamped_val >= 50.0:
            health_status = "Good"
            health_indicator = "🟡"
            health_color = "#eab308"
        elif clamped_val >= 20.0:
            health_status = "Low"
            health_indicator = "🟠"
            health_color = "#f97316"
        else:
            health_status = "Critical"
            health_indicator = "🔴"
            health_color = "#ef4444"

        # AI Recommendations & Saving Tips
        tips = [
            "Reduce screen brightness to 40% or enable Auto-Brightness.",
            "Enable 'Sleep / Do Not Disturb' schedules to reduce wake cycles.",
            "Force close heavy background apps like gaming or GPS navigation when not active."
        ]
        
        if clamped_val < 50.0:
            tips.insert(0, "Enable Low Power Mode / Battery Saver settings immediately.")
            tips.append("Switch apps to Dark Mode to save OLED/AMOLED panel power.")
        else:
            tips.insert(0, "Maintain battery charge between 20% and 80% to maximize lifespan.")
            
        if screen_time > 6.0:
            recommendation = "High screen activity detected. Consider a charging session or cooling down your device to avoid thermal throttling."
        else:
            recommendation = "Normal activity level. Your battery health depletion matches expected linear rates."

        return jsonify({
            'success': True,
            'screen_time': screen_time,
            'predicted_battery_percent_raw': round(prediction_val, 2),
            'predicted_battery_percent_clamped': round(clamped_val, 2),
            'health_status': health_status,
            'health_indicator': health_indicator,
            'health_color': health_color,
            'confidence': round(confidence, 1),
            'tips': tips[:4],
            'recommendation': recommendation,
            'equation': f"y = {intercept:.2f} + ({slope:.2f}) * x"
        })
        
    except Exception as e:
        return jsonify({'success': False, 'error': str(e)}), 500

@app.route('/api/chat', methods=['POST'])
def chat():
    try:
        data = request.get_json()
        if not data or 'message' not in data:
            return jsonify({'success': False, 'reply': 'Missing message field.'}), 400
            
        message = data['message'].strip()
        lower_msg = message.lower()
        
        # 1. Parse prediction requests
        # e.g., "predict for 5.5 hours", "predict 6", "what is battery at 7 hours?"
        hours_match = re.search(r'(?:predict|battery|at|after|for)\s*([0-9]*\.?[0-9]+)\s*(?:hours|hour|h)?', lower_msg)
        standalone_number = re.match(r'^([0-9]*\.?[0-9]+)$', lower_msg)
        
        parsed_hours = None
        if hours_match:
            try:
                parsed_hours = float(hours_match.group(1))
            except ValueError:
                pass
        elif standalone_number:
            try:
                parsed_hours = float(standalone_number.group(1))
            except ValueError:
                pass
                
        if parsed_hours is not None:
            if parsed_hours < 0 or parsed_hours > 24:
                return jsonify({'success': True, 'reply': "🤖 Battery predictions are constrained to screen times between 0 and 24 hours. Please enter a value in this range."})
                
            pred = model.predict([[parsed_hours]])[0]
            clamped = max(0.0, min(100.0, pred))
            status = "Excellent" if clamped >= 80 else ("Good" if clamped >= 50 else ("Low" if clamped >= 20 else "Critical"))
            indicator = "🟢" if clamped >= 80 else ("🟡" if clamped >= 50 else ("🟠" if clamped >= 20 else "🔴"))
            
            reply = (
                f"🤖 *[AI Predictor Run]*\n"
                f"Input Screen Time: **{parsed_hours} hours**\n"
                f"Predicted Remaining Battery: **{clamped:.2f}%** (raw model fit: {pred:.2f}%)\n"
                f"System Health Status: **{indicator} {status}**\n\n"
                f"I have successfully logged this result and highlighted it on your interactive graph!"
            )
            return jsonify({'success': True, 'reply': reply, 'screen_time': parsed_hours})

        # 2. Dataset Stats
        if any(k in lower_msg for k in ['stats', 'statistics', 'dataset', 'mean', 'average', 'min', 'max', 'records', 'count']):
            reply = (
                f"📊 *[Dataset Insights]*\n"
                f"• Total records in testing set: **{len(df)}**\n"
                f"• Average Screen Time: **{df['Screen_Time_Hours'].mean():.2f} hours**\n"
                f"• Average Battery Remaining: **{df['Battery_Remaining_Percent'].mean():.2f}%**\n"
                f"• Maximum Tested Battery: **{df['Battery_Remaining_Percent'].max()}%**\n"
                f"• Minimum Tested Battery: **{df['Battery_Remaining_Percent'].min()}%**\n\n"
                f"Would you like me to predict a specific value for you? Type a number like '4.5'!"
            )
            return jsonify({'success': True, 'reply': reply})

        # 3. Model Math / Equation
        if any(k in lower_msg for k in ['equation', 'formula', 'coefficient', 'slope', 'intercept', 'math', 'calculate', 'r2', 'r-squared']):
            reply = (
                f"📐 *[Model Mathematics]*\n"
                f"The fitted Linear Regression model formula is:\n"
                f"**`y = β₀ + β₁·x`**\n\n"
                f"Where:\n"
                f"• **β₀ (Y-Intercept)**: `{intercept:.2f}%` (Estimated charge at 0 hours)\n"
                f"• **β₁ (Slope)**: `{slope:.4f}%` (Rate of battery drain per hour)\n"
                f"• **R² (Coefficient of Determination)**: `{r2_score:.4f}` (representing `{r2_score*100:.2f}%` model match)\n\n"
                f"Equation: **Battery % = {intercept:.2f} - {abs(slope):.2f} * Hours**"
            )
            return jsonify({'success': True, 'reply': reply})

        # 4. Battery saving tips
        if any(k in lower_msg for k in ['save', 'tips', 'increase', 'extend', 'power', 'drain', 'recommendation']):
            reply = (
                f"💡 *[AI Power Saving Tips]*\n"
                f"1. **Display Brightness**: backlights are high-frequency consumers. Keep brightness below 50%.\n"
                f"2. **OLED Dark Mode**: Dark UI states allow OLED/AMOLED pixels to remain turned off, saving up to 15% power.\n"
                f"3. **Background Services**: Disable auto-sync features on apps that refresh frequently in the background.\n"
                f"4. **Fast Charge heat**: Keep the device cool when charging; thermal stress degrades battery capacity cells over time."
            )
            return jsonify({'success': True, 'reply': reply})

        # 5. Greetings
        if any(k in lower_msg for k in ['hello', 'hi', 'hey', 'greetings', 'welcome', 'g\'day']):
            reply = "👋 Hello! I am your real-time VoltPredict AI Assistant, connected directly to our Flask ML backend. Ask me to make a prediction (e.g. 'predict battery for 5.5 hours'), inquire about the model formula, or request battery statistics!"
            return jsonify({'success': True, 'reply': reply})

        # 6. Fallback
        reply = (
            f"🤖 I received your message: \"{message}\"\n\n"
            f"Here is what you can ask me to do in real-time:\n"
            f"• *'Predict battery for 5 hours'* (runs the ML model)\n"
            f"• *'Show dataset stats'* (reads averages from CSV)\n"
            f"• *'What is the model formula?'* (shows regression line formula)\n"
            f"• *'Give me battery saving tips'* (displays power diagnostic tips)"
        )
        return jsonify({'success': True, 'reply': reply})

    except Exception as e:
        return jsonify({'success': False, 'reply': f"Error processing query: {str(e)}"}), 500

@app.route('/api/export-pdf', methods=['POST'])
def export_pdf():
    try:
        data = request.get_json()
        if not data:
            return jsonify({'success': False, 'error': 'No report data provided.'}), 400
            
        history = data.get('history', [])
        current_prediction = data.get('current', None)
        
        # Create PDF document in memory
        buffer = io.BytesIO()
        doc = SimpleDocTemplate(
            buffer, 
            pagesize=letter,
            rightMargin=40, leftMargin=40, topMargin=40, bottomMargin=40
        )
        
        styles = getSampleStyleSheet()
        
        # Custom styles
        title_style = ParagraphStyle(
            'TitleStyle',
            parent=styles['Heading1'],
            fontName='Helvetica-Bold',
            fontSize=24,
            textColor=colors.HexColor('#1e3a8a'),
            spaceAfter=15
        )
        
        h2_style = ParagraphStyle(
            'H2Style',
            parent=styles['Heading2'],
            fontName='Helvetica-Bold',
            fontSize=16,
            textColor=colors.HexColor('#0f172a'),
            spaceBefore=15,
            spaceAfter=8
        )
        
        body_style = ParagraphStyle(
            'BodyStyle',
            parent=styles['BodyText'],
            fontName='Helvetica',
            fontSize=10,
            textColor=colors.HexColor('#334155'),
            spaceAfter=6
        )

        bold_body = ParagraphStyle(
            'BoldBody',
            parent=body_style,
            fontName='Helvetica-Bold'
        )

        elements = []
        
        # Header
        elements.append(Paragraph("VoltPredict AI Report", title_style))
        elements.append(Paragraph(f"Generated on {datetime.now().strftime('%Y-%m-%d %I:%M %p')}", body_style))
        elements.append(Spacer(1, 15))
        
        # Section 1: Model parameters
        elements.append(Paragraph("Linear Regression Model Metrics", h2_style))
        model_info = [
            [Paragraph("Model Equation:", bold_body), Paragraph(f"Battery % = {intercept:.2f} + ({slope:.2f} * Screen Time)", body_style)],
            [Paragraph("Correlation Coeff (R²):", bold_body), Paragraph(f"{r2_score:.4f}", body_style)],
            [Paragraph("Dataset Records Trained:", bold_body), Paragraph(f"{len(df)} records", body_style)],
            [Paragraph("Average Screen Time:", bold_body), Paragraph(f"{mean_screen_time:.2f} hours", body_style)]
        ]
        t1 = Table(model_info, colWidths=[150, 350])
        t1.setStyle(TableStyle([
            ('GRID', (0,0), (-1,-1), 0.5, colors.HexColor('#cbd5e1')),
            ('BACKGROUND', (0,0), (0,-1), colors.HexColor('#f8fafc')),
            ('PADDING', (0,0), (-1,-1), 6),
            ('VALIGN', (0,0), (-1,-1), 'MIDDLE'),
        ]))
        elements.append(t1)
        elements.append(Spacer(1, 20))
        
        # Section 2: Current prediction
        if current_prediction:
            elements.append(Paragraph("Latest Prediction Result", h2_style))
            pred_info = [
                [Paragraph("Input Screen Time", bold_body), Paragraph(f"{current_prediction.get('screen_time_hours')} hrs", body_style)],
                [Paragraph("Predicted Battery Remaining", bold_body), Paragraph(f"{current_prediction.get('predicted_battery_percent_clamped')}%", body_style)],
                [Paragraph("Battery Health Status", bold_body), Paragraph(f"{current_prediction.get('health_status')}", body_style)],
                [Paragraph("Model Confidence Level", bold_body), Paragraph(f"{current_prediction.get('confidence')}%", body_style)]
            ]
            t2 = Table(pred_info, colWidths=[180, 320])
            t2.setStyle(TableStyle([
                ('GRID', (0,0), (-1,-1), 0.5, colors.HexColor('#cbd5e1')),
                ('BACKGROUND', (0,0), (0,-1), colors.HexColor('#f8fafc')),
                ('PADDING', (0,0), (-1,-1), 6),
                ('VALIGN', (0,0), (-1,-1), 'MIDDLE'),
            ]))
            elements.append(t2)
            elements.append(Spacer(1, 20))
            
        # Section 3: Prediction history table
        if history:
            elements.append(Paragraph("Calculation History Log", h2_style))
            history_data = [
                [Paragraph("Timestamp", bold_body), Paragraph("Screen Time (Hours)", bold_body), Paragraph("Predicted Battery", bold_body)]
            ]
            
            for item in history[:15]:
                history_data.append([
                    Paragraph(item.get('timestamp', ''), body_style),
                    Paragraph(f"{item.get('screen_time_hours')} hrs", body_style),
                    Paragraph(f"{item.get('predicted_battery_percent_clamped')}%", body_style)
                ])
                
            t3 = Table(history_data, colWidths=[180, 160, 160])
            t3.setStyle(TableStyle([
                ('GRID', (0,0), (-1,-1), 0.5, colors.HexColor('#cbd5e1')),
                ('BACKGROUND', (0,0), (-1,0), colors.HexColor('#f1f5f9')),
                ('PADDING', (0,0), (-1,-1), 5),
                ('ALIGN', (0,0), (-1,-1), 'LEFT'),
                ('VALIGN', (0,0), (-1,-1), 'MIDDLE'),
            ]))
            elements.append(t3)
            
        # Build PDF
        doc.build(elements)
        buffer.seek(0)
        
        return send_file(
            buffer, 
            as_attachment=True, 
            download_name='VoltPredict_AI_Report.pdf',
            mimetype='application/pdf'
        )
        
    except Exception as e:
        return jsonify({'success': False, 'error': str(e)}), 500

if __name__ == '__main__':
    app.run(debug=True, host='0.0.0.0', port=5001)
